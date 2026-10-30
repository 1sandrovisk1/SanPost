import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Connection, Client } from '@temporalio/client';
import { NativeConnection, Worker, Runtime } from '@temporalio/worker';
import { createMock } from '@gitroom/nestjs-libraries/test';
import {
  PostWorkflowMigrationService,
  V112_MIGRATION_REASON,
} from '@gitroom/nestjs-libraries/database/prisma/posts/post-workflow-migration.service';
import { PostWorkflowMigrationRepository } from '@gitroom/nestjs-libraries/database/prisma/posts/post-workflow-migration.repository';

// Exige servidor isolado, nunca usa TEMPORAL_ADDRESS da aplicacao.
const integration =
  process.env.RUN_TEMPORAL_MIGRATION_INTEGRATION === 'true'
    ? describe
    : describe.skip;
integration('Migracao V112 com Temporal real isolado', () => {
  it('substitui timer legado, retoma gap e preserva vencedor concorrente sem publicar', async () => {
    const address = '127.0.0.1:17233';
    const connection = await Connection.connect({ address });
    const native = await NativeConnection.connect({ address });
    const client = new Client({ connection });
    await connection.operatorService
      .addSearchAttributes({
        namespace: 'default',
        searchAttributes: { postId: 1, organizationId: 1 },
      })
      .catch((error) => {
        if (error.code !== 6) throw error;
      });
    const queue = `migration-integration-${Date.now()}`;
    const publishDate = new Date(Date.now() + 7200000);
    const posts = new Map(
      ['normal', 'gap', 'concurrent'].map((id) => [
        id,
        {
          id,
          state: 'QUEUE',
          publishDate,
          organizationId: 'test-org',
          updatedAt: new Date(),
          integrationId: 'test-channel',
          integration: {
            id: 'test-channel',
            providerIdentifier: 'youtube',
            token: 'OLD_TEST_TOKEN',
            refreshToken: 'OLD_TEST_REFRESH',
          },
        },
      ])
    );
    const repository = createMock<PostWorkflowMigrationRepository>();
    repository.findCandidate.mockImplementation(
      async (id) => posts.get(id) as any
    );
    const service = new PostWorkflowMigrationService(repository, {
      client: { getRawClient: () => client },
    } as any);
    const publish = jest.fn();
    const fixture = require.resolve('./fixtures/migration-workflows');
    const code = execFileSync(
      process.execPath,
      [
        '-e',
        `require('@temporalio/worker').bundleWorkflowCode({workflowsPath: ${JSON.stringify(
          fixture
        )}}).then(bundle => process.stdout.write(bundle.code));`,
      ],
      {
        cwd: resolve(__dirname, '../../../..'),
        encoding: 'utf8',
        maxBuffer: 12 * 1024 * 1024,
      }
    );
    const worker = await Worker.create({
      connection: native,
      taskQueue: queue,
      workflowBundle: { code },
      activities: {
        getPostsList: async (_org: string, id: string) => [posts.get(id)],
        getPostV112: async (_org: string, id: string) => {
          const p = posts.get(id)!;
          return { id, state: p.state, publishDate: p.publishDate };
        },
        postSocial: publish,
      },
    });
    // A migracao usa main para workflows novos, como em producao.
    let acceptedWrites = 0;
    const acceptedPublish = jest.fn(async () => [
      {
        id: 'accepted',
        postId: 'remote-accepted',
        releaseURL: '',
        status: 'pending',
        pendingData: { postId: 'remote-accepted' },
      },
    ]);
    const main = await Worker.create({
      connection: native,
      taskQueue: 'main',
      workflowBundle: { code },
      activities: {
        getPostV112: async (_org: string, id: string) => {
          const p = posts.get(id)!;
          return { id, state: p.state, publishDate: p.publishDate };
        },
        getPostsListV112: async (_org: string, id: string) => {
          const p = posts.get(id)!;
          return [
            {
              id,
              state: p.state,
              publishDate: p.publishDate,
              organizationId: p.organizationId,
              integration: {
                id: 'test-channel',
                providerIdentifier: 'zernio-tiktok',
              },
            },
          ];
        },
        postSocialPending: acceptedPublish,
        recordAcceptedPost: async (
          _org: string,
          id: string,
          remoteId: string
        ) => {
          acceptedWrites++;
          if (acceptedWrites === 1) throw new Error('temporary db failure');
          (posts.get(id) as any).releaseId = remoteId;
        },
        checkPostStatus: async () => {
          throw new BadBody(
            'zernio-tiktok',
            '{}',
            Buffer.from('{}'),
            'partial'
          );
        },
        changeState: async (id: string, state: string) => {
          posts.get(id)!.state = state;
        },
        inAppNotification: async (): Promise<void> => undefined,
      },
    });
    const waitTimer = async (id: string) => {
      for (let i = 0; i < 100; i++) {
        const history = await client.workflow
          .getHandle(`post_${id}`)
          .fetchHistory();
        if (history.events?.some((e) => e.timerStartedEventAttributes)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('Timer inicial nao registrado');
    };
    try {
      await worker.runUntil(() =>
        main.runUntil(async () => {
          for (const id of posts.keys()) {
            await client.workflow.start('postWorkflowV102', {
              workflowId: `post_${id}`,
              taskQueue: queue,
              args: [
                { taskQueue: queue, postId: id, organizationId: 'test-org' },
              ],
            });
            await waitTimer(id);
          }
          const old = await client.workflow.getHandle('post_normal').describe();
          expect(await service.migratePost('normal')).toBe('migrated');
          expect(
            (await client.workflow.getHandle('post_normal').describe()).type
          ).toBe('postWorkflowV112');
          const final = await client.workflow
            .getHandle('post_normal', old.runId)
            .fetchHistory();
          expect(
            final.events?.at(-1)?.workflowExecutionTerminatedEventAttributes
              ?.reason
          ).toBe(V112_MIGRATION_REASON);
          const start = jest.spyOn(client.workflow, 'start');
          start.mockRejectedValueOnce(new Error('simulated start outage'));
          await expect(service.migratePost('gap')).rejects.toThrow(
            'simulated start outage'
          );
          start.mockRestore();
          expect(await service.migratePost('gap')).toBe('migrated');
          await Promise.allSettled([
            service.migratePost('concurrent'),
            service.migratePost('concurrent'),
          ]);
          expect(
            (await client.workflow.getHandle('post_concurrent').describe()).type
          ).toBe('postWorkflowV112');
          expect(await service.migratePost('normal')).toBe('already-v112');
          const fresh = await client.workflow
            .getHandle('post_normal')
            .fetchHistory();
          expect(JSON.stringify(fresh)).not.toContain('OLD_TEST_TOKEN');
          expect(publish).not.toHaveBeenCalled();
          expect(posts.get('normal')!.publishDate).toBe(publishDate);
          posts.set('accepted', { ...posts.get('normal')!, id: 'accepted' });
          const pending = await client.workflow.start('postWorkflowV112', {
            workflowId: 'post_accepted',
            taskQueue: 'main',
            args: [
              {
                taskQueue: 'main',
                postId: 'accepted',
                organizationId: 'test-org',
                postNow: true,
              },
            ],
          });
          await pending.result();
          expect(acceptedPublish).toHaveBeenCalledTimes(1);
          expect(acceptedWrites).toBe(2);
          expect((posts.get('accepted') as any).releaseId).toBe(
            'remote-accepted'
          );
          expect(posts.get('accepted')!.state).toBe('ERROR');
          const acceptedHistory = await pending.fetchHistory();
          expect(
            acceptedHistory.events?.some(
              (e) =>
                e.markerRecordedEventAttributes?.markerName === 'core_patch'
            )
          ).toBe(true);
          await Worker.runReplayHistory(
            { workflowBundle: { code } },
            acceptedHistory,
            'post_accepted'
          );
          // Replay do legado encerrado tambem precisa continuar valido.
          await Worker.runReplayHistory(
            { workflowBundle: { code } },
            final,
            'post_normal'
          );
          for (const id of posts.keys()) {
            const handle = client.workflow.getHandle(`post_${id}`);
            if ((await handle.describe()).status.name === 'RUNNING')
              await handle.terminate('integration cleanup');
          }
        })
      );
    } finally {
      await native.close();
      await connection.close();
      await Runtime.instance().shutdown();
    }
  }, 90000);
});
