jest.mock('../../../integrations/automations/comment-channel.service', () => ({
  CommentChannelService: jest.fn(),
}));
jest.mock('../flows/flows.service', () => ({ FlowsService: jest.fn() }));
import { PostsRepository } from '../posts/posts.repository';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import {
  ScheduledPostsRepository,
  syncScheduledTarget,
} from './scheduled-posts.repository';
import { SharedFlowsRepository } from '../flows-v2/shared-flows.repository';
import { ScheduledAutomationProcessor } from '../../../integrations/automations/scheduled-automation.processor';
import { simpleDefinition } from '../flows-v2/flow-definition';
const url = process.env.SHARED_FLOW_TEST_DATABASE_URL;
(url ? describe : describe.skip)('agendamentos em PostgreSQL isolado', () => {
  let db: PrismaService,
    repo: ScheduledPostsRepository,
    shared: SharedFlowsRepository;
  let scope: { organizationId: string; profileId: string },
    integrationId: string;
  beforeAll(async () => {
    if (!new URL(url!).pathname.startsWith('/multipost_shared_test_'))
      throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
    process.env.DATABASE_URL = url;
    db = new PrismaService();
    await db.$connect();
    repo = new ScheduledPostsRepository(db);
    shared = new SharedFlowsRepository(db);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  beforeEach(async () => {
    const org = await db.organization.create({
      data: { name: 'Fixture agendamentos' },
    });
    const profile = await db.profile.create({
      data: { organizationId: org.id, name: 'Fixture', slug: randomUUID() },
    });
    scope = { organizationId: org.id, profileId: profile.id };
    const integration = await db.integration.create({
      data: {
        ...scope,
        internalId: '123456',
        name: 'Fixture Facebook',
        providerIdentifier: 'facebook',
        type: 'social',
        token: 'FIXTURE-ONLY',
      },
    });
    integrationId = integration.id;
  });
  it('proxima publicacao nao captura post reservado antes ou depois de resolver os ids', async () => {
    const f = await fixture(880);
    const nextId = await shared.save(scope, { name: 'Proxima', channels: [], definition: simpleDefinition({ message: 'Outra' }) }, [{ integrationId, platform: 'facebook', remoteAccountId: '123456', postMode: 'next_publication', postIds: [] }]);
    await shared.setStatus(scope, nextId, 1, 'ACTIVE');
    await db.post.update({ where: { id: f.post.id }, data: { state: 'PUBLISHED', releaseId: f.event.externalPostId } });
    await shared.bindNext(integrationId, f.event.externalPostId);
    expect((await shared.get(scope, nextId)).channels[0].boundPostId).toBeNull();
    expect(await shared.ingest({ ...f.event, occurredAt: Date.now() + 10 })).toEqual([]);
    await db.scheduledAutomationTarget.update({ where: { flowId_integrationId: { flowId: f.flowId, integrationId } }, data: { boundPostIds: [f.event.externalPostId] } });
    expect(await shared.ingest({ ...f.event, externalEventId: '880_1000', occurredAt: Date.now() + 10 })).toEqual([]);
    await shared.bindNext(integrationId, '123456_881');
    expect((await shared.get(scope, nextId)).channels[0].boundPostId).toBe('123456_881');
  });
  it('edicao V1 por snapshot e atomica em concorrencia e preserva canvas no conflito', async () => {
    const f = await fixture(990);
    const original = await db.flow.update({ where: { id: f.flowId }, data: { executionVersion: 1, status: 'PAUSED' } });
    const nodes = [
      { id: 'trigger', type: 'TRIGGER' as const, data: '{"mode":"all","triggerType":"comment_on_post"}', positionX: 0, positionY: 0 },
      { id: 'dm', type: 'SEND_DM' as const, data: '{"message":"Snapshot"}', positionX: 0, positionY: 100 },
    ];
    const edges = [{ sourceNodeId: 'trigger', targetNodeId: 'dm' }];
    const writes = await Promise.allSettled(['A','B'].map(name => repo.saveLegacyCanvas(scope, f.flowId, nodes, edges, { name, expectedUpdatedAt: original.updatedAt.toISOString() })));
    expect(writes.filter(w => w.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter(w => w.status === 'rejected')).toHaveLength(1);
    const saved = await db.flow.findUniqueOrThrow({ where: { id: f.flowId }, include: { nodes: true, edges: true } });
    expect(saved.nodes).toHaveLength(2); expect(saved.edges).toHaveLength(1);
    expect(saved.revision).toBe(original.revision + 1);
    await expect(repo.saveLegacyCanvas(scope, f.flowId, [], [], { name: 'Stale', expectedUpdatedAt: original.updatedAt.toISOString() })).rejects.toThrow('REVISION_CONFLICT');
    expect(await db.flowNode.count({ where: { flowId: f.flowId } })).toBe(2);
    expect((await db.flow.findUniqueOrThrow({ where: { id: f.flowId } })).name).toBe(saved.name);
  });
  it('retoma primeiro comentario de outro post apos confirmar alias sem duplicar nem usar regra nova', async () => {
    const f = await fixture(900);
    const nextId = await shared.save(scope, { name: 'Proxima', channels: [], definition: simpleDefinition({ message: 'Proxima resposta' }) }, [{ integrationId, platform: 'facebook', remoteAccountId: '123456', postMode: 'next_publication', postIds: [] }]);
    await shared.setStatus(scope, nextId, 1, 'ACTIVE');
    await db.post.update({ where: { id: f.post.id }, data: { state: 'PUBLISHED', releaseId: '999999' } });
    const event = { ...f.event, externalPostId: '123456_901', occurredAt: Date.now() + 10 };
    await repo.capture(event);
    expect(await shared.ingest(event)).toEqual([]);
    const pending = await db.deferredNextAutomationEvent.findFirst({ where: { integrationId } });
    const captured = { deferredNext: pending!.candidates as any };
    expect(captured.deferredNext[0].id).toBe(nextId);
    await db.scheduledAutomationTarget.update({ where: { flowId_integrationId: { flowId: f.flowId, integrationId } }, data: { boundPostIds: ['123456_900'], boundAt: new Date() } });
    await db.flow.update({ where: { id: f.flowId }, data: { status: 'PAUSED', deletedAt: new Date() } });
    await db.scheduledAutomationTarget.deleteMany({ where: { flowId: f.flowId } });
    expect(await db.deferredNextAutomationEvent.count({ where: { integrationId } })).toBe(1);
    expect(await shared.ingest(event, undefined, captured.deferredNext)).toHaveLength(1);
    expect(await shared.ingest(event, undefined, captured.deferredNext)).toEqual([]);
    expect((await shared.get(scope, nextId)).channels[0].boundPostId).toBe('123456_901');
  });
  async function fixture(n: number, published = false) {
    const post = await db.post.create({
      data: {
        ...scope,
        integrationId,
        content: `Post ${n}`,
        group: randomUUID(),
        publishDate: new Date(Date.now() - 10000),
        state: published ? 'PUBLISHED' : 'QUEUE',
        releaseId: published ? `123456_${n}` : null,
      },
    });
    const flowId = await shared.save(
      scope,
      {
        name: `Regra ${n}`,
        channels: [],
        definition: simpleDefinition({
          message: 'Fixture',
          keywords: ['quero'],
        }),
      },
      [
        {
          integrationId,
          platform: 'facebook',
          remoteAccountId: '123456',
          postMode: 'scheduled',
          postIds: [],
          scheduledPostId: post.id,
        },
      ]
    );
    await shared.setStatus(scope, flowId, 1, 'ACTIVE');
    return {
      post,
      flowId,
      event: {
        ...scope,
        integrationId,
        platform: 'facebook' as const,
        remoteAccountId: '123456',
        externalEventId: `${n}_999`,
        externalPostId: `123456_${n}`,
        externalActorId: '888',
        text: 'quero',
        occurredAt: Date.now() + 10,
      },
    };
  }
  it('30 posts fora de ordem nao invadem os outros e reentrega nao duplica', async () => {
    const fixtures = [];
    for (let n = 1; n <= 30; n++) fixtures.push(await fixture(n));
    process.env.SHARED_AUTOMATIONS_ENABLED = 'true';
    const resolver = {
      scheduledPublishedIds: jest
        .fn()
        .mockImplementation(async (_s, _i, id) => [id]),
    };
    const processor = new ScheduledAutomationProcessor(
      { repository: repo } as any,
      {} as any,
      shared,
      resolver as any
    );
    // Captures only one not-yet-due target per event; publication order is reversed.
    await db.post.updateMany({
      where: { organizationId: scope.organizationId },
      data: { publishDate: new Date(Date.now() + 86400000) },
    });
    for (const f of [...fixtures].reverse()) {
      await db.post.update({
        where: { id: f.post.id },
        data: {
          publishDate: new Date(Date.now() - 1000),
          state: 'PUBLISHED',
          releaseId: f.event.externalPostId,
        },
      });
      f.event.occurredAt = Date.now() + 10;
      await Promise.all([repo.capture(f.event), repo.capture(f.event)]);
      for (let n = 0; n < 2; n++) await processor.tick();
    }
    const executions = await db.flowExecutionV2.findMany({ where: scope });
    expect(executions).toHaveLength(30);
    for (const f of fixtures)
      expect(executions.filter((e) => e.flowId === f.flowId)).toHaveLength(1);
    expect(
      await db.automationDispatch.count({
        where: { flowId: { in: fixtures.map((f) => f.flowId) } },
      })
    ).toBe(30);
  }, 60000);
  it('evento antes do resultado espera, retoma e nao casa regras comuns novas', async () => {
    const f = await fixture(44);
    await repo.capture(f.event);
    const processor = new ScheduledAutomationProcessor(
      { repository: repo } as any,
      {} as any,
      shared,
      { scheduledPublishedIds: async () => [f.event.externalPostId] } as any
    );
    await processor.tick();
    expect(await db.flowExecutionV2.count({ where: scope })).toBe(0);
    await db.post.update({
      where: { id: f.post.id },
      data: { state: 'PUBLISHED', releaseId: f.event.externalPostId },
    });
    await db.scheduledAutomationEvent.updateMany({
      where: { target: { flowId: f.flowId } },
      data: { availableAt: new Date(0) },
    });
    await Promise.all([
      processor.tick(),
      new ScheduledAutomationProcessor(
        { repository: repo } as any,
        {} as any,
        shared,
        { scheduledPublishedIds: async () => [f.event.externalPostId] } as any
      ).tick(),
    ]);
    expect(await db.flowExecutionV2.count({ where: scope })).toBe(1);
    expect(await shared.ingest(f.event)).toEqual([]);
  });
  it('rollback conserva canvas e alvo anterior quando o destino foi cancelado', async () => {
    const f = await fixture(55);
    await db.flow.update({
      where: { id: f.flowId },
      data: { executionVersion: 1, status: 'PAUSED' },
    });
    await db.post.update({
      where: { id: f.post.id },
      data: { state: 'DRAFT' },
    });
    await expect(
      repo.saveLegacyCanvas(
        scope,
        f.flowId,
        [
          {
            id: 'n',
            type: 'TRIGGER',
            data: JSON.stringify({
              mode: 'scheduled',
              scheduledPostId: f.post.id,
            }),
            positionX: 0,
            positionY: 0,
          },
        ],
        []
      )
    ).rejects.toThrow();
    expect(
      await db.scheduledAutomationTarget.count({ where: { flowId: f.flowId } })
    ).toBe(1);
    expect(await db.flowNode.count({ where: { flowId: f.flowId } })).toBe(0);
  });
  it('postId de outro perfil nao entra no alvo nem na lista', async () => {
    const f = await fixture(66);
    const other = { ...scope, profileId: randomUUID() };
    expect(await repo.post(other, integrationId, f.post.id)).toBeNull();
    await expect(
      db.$transaction((tx) =>
        syncScheduledTarget(tx, other, f.flowId, integrationId, f.post.id)
      )
    ).rejects.toThrow();
  });
  it('alvo e primeira publicacao concorrentes conservam a primeira ocorrencia', async () => {
    const f = await fixture(77);
    await db.scheduledAutomationTarget.deleteMany({
      where: { flowId: f.flowId },
    });
    let release: () => void;
    let ready: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const saving = db.$transaction(async (tx) => {
      await syncScheduledTarget(tx, scope, f.flowId, integrationId, f.post.id);
      ready();
      await barrier;
    });
    await started;
    const publisher = new PostsRepository(
      { model: db } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { model: db } as any
    );
    const publishing = publisher.updatePost(
      f.post.id,
      '123456_77',
      'https://example.com/77'
    );
    release();
    await Promise.all([saving, publishing]);
    await publisher.updatePost(
      f.post.id,
      '123456_78',
      'https://example.com/78'
    );
    expect(
      (
        await db.scheduledAutomationTarget.findFirst({
          where: { flowId: f.flowId },
        })
      ).publishedReleaseId
    ).toBe('123456_77');
  });
  it('correcao de releaseId missing participa do vinculo exato', async () => {
    const f = await fixture(88);
    const publisher = new PostsRepository(
      { model: db } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { model: db } as any
    );
    await publisher.updatePost(f.post.id, 'missing', 'https://example.com/88');
    await publisher.updateReleaseId(
      f.post.id,
      scope.organizationId,
      '123456_88'
    );
    expect(
      (
        await db.scheduledAutomationTarget.findFirst({
          where: { flowId: f.flowId },
        })
      ).publishedReleaseId
    ).toBe('123456_88');
  });
  it('data alterada depois de publicar nao remove a captura do post exato', async () => {
    const f=await fixture(99);
    await db.post.update({where:{id:f.post.id},data:{state:'PUBLISHED',releaseId:f.event.externalPostId,publishDate:new Date(Date.now()+86400000)}});
    f.event.occurredAt=Date.now()+10;
    await repo.capture(f.event);
    expect(await db.scheduledAutomationEvent.count({where:{target:{flowId:f.flowId}}})).toBe(1);
  });

});
