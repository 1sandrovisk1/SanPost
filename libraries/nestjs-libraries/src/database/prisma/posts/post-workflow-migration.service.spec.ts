import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostWorkflowMigrationRepository } from './post-workflow-migration.repository';
import {
  PostWorkflowMigrationService,
  V112_MIGRATION_REASON,
} from './post-workflow-migration.service';

const payload = (v: unknown) => ({ data: Buffer.from(JSON.stringify(v)) });

describe('PostWorkflowMigrationService', () => {
  const base = new Date('2026-11-01T10:00:00Z');
  let repo: ReturnType<typeof createMock<PostWorkflowMigrationRepository>>;
  let service: PostWorkflowMigrationService;
  let old: any;
  let winner: any;
  let client: any;
  let candidate: any;
  let history: any;
  let current: any;
  const started = () => ({
    workflowExecutionStartedEventAttributes: {
      input: {
        payloads: [
          payload({ postId: 'p', organizationId: 'o', taskQueue: 'youtube' }),
        ],
      },
    },
  });
  const mutation = {
    activityTaskScheduledEventAttributes: {
      activityType: { name: 'postSocial' },
    },
  };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(base);
    repo = createMock<PostWorkflowMigrationRepository>();
    candidate = {
      id: 'p',
      organizationId: 'o',
      integrationId: 'i',
      publishDate: new Date(base.getTime() + 3600000),
      updatedAt: base,
      integration: { providerIdentifier: 'youtube' },
    };
    repo.findCandidate.mockResolvedValue(candidate);
    repo.listCandidates.mockResolvedValue([{ id: 'p' }] as any);
    history = {
      events: [
        started(),
        {
          activityTaskScheduledEventAttributes: {
            activityType: { name: 'getPostsList' },
          },
        },
        {
          activityTaskCompletedEventAttributes: {
            result: {
              payloads: [
                payload([
                  {
                    id: 'p',
                    organizationId: 'o',
                    publishDate: candidate.publishDate,
                    integration: { id: 'i' },
                  },
                ]),
              ],
            },
          },
        },
        {
          eventId: 8,
          eventTime: { seconds: base.getTime() / 1000 },
          timerStartedEventAttributes: {
            timerId: '1',
            startToFireTimeout: { seconds: 3600 },
          },
        },
      ],
    };
    old = {
      describe: jest
        .fn()
        .mockResolvedValue({
          type: 'postWorkflowV102',
          runId: 'old',
          status: { name: 'RUNNING' },
        }),
      fetchHistory: jest.fn().mockImplementation(async () => history),
      terminate: jest.fn().mockImplementation(async () => {
        history = {
          events: [
            ...history.events,
            {
              workflowExecutionTerminatedEventAttributes: {
                reason: V112_MIGRATION_REASON,
              },
            },
          ],
        };
      }),
    };
    winner = {
      describe: jest
        .fn()
        .mockResolvedValue({
          type: 'postWorkflowV112',
          runId: 'new',
          status: { name: 'RUNNING' },
        }),
      fetchHistory: jest.fn().mockResolvedValue({ events: [started()] }),
    };
    current = old;
    client = {
      workflow: {
        withDeadline: jest.fn(async (_deadline, operation) => operation()),
        getHandle: jest.fn((_id, run) => (run ? old : current)),
        start: jest.fn().mockImplementation(async () => {
          current = winner;
          return winner;
        }),
      },
    };
    service = new PostWorkflowMigrationService(repo, {
      client: { getRawClient: () => client },
    } as any);
  });
  afterEach(() => jest.useRealTimers());
  it('substitui apenas o run aguardando e preserva post, canal e horario', async () => {
    expect(await service.migratePost('p')).toBe('migrated');
    expect(client.workflow.getHandle).toHaveBeenCalledWith('post_p', 'old');
    expect(old.terminate).toHaveBeenCalledWith(V112_MIGRATION_REASON);
    expect(client.workflow.start).toHaveBeenCalledWith(
      'postWorkflowV112',
      expect.objectContaining({
        workflowId: 'post_p',
        taskQueue: 'main',
        workflowIdConflictPolicy: 'USE_EXISTING',
        args: [{ postId: 'p', organizationId: 'o', taskQueue: 'youtube' }],
      })
    );
    expect(candidate.publishDate).toEqual(new Date('2026-11-01T11:00:00Z'));
  });
  it('Zernio permanece na fila main', async () => {
    candidate.integration.providerIdentifier = 'zernio-tiktok';
    await service.migratePost('p');
    expect(client.workflow.start.mock.calls[0][1].args[0].taskQueue).toBe(
      'main'
    );
  });
  it('V112 ja existente torna a repeticao um no-op', async () => {
    current = winner;
    expect(await service.migratePost('p')).toBe('already-v112');
    expect(old.terminate).not.toHaveBeenCalled();
    expect(client.workflow.start).not.toHaveBeenCalled();
  });
  it('retoma a falha entre terminar e iniciar', async () => {
    client.workflow.start.mockRejectedValueOnce(new Error('offline'));
    await expect(service.migratePost('p')).rejects.toThrow('offline');
    old.describe.mockResolvedValue({
      type: 'postWorkflowV102',
      runId: 'old',
      status: { name: 'TERMINATED' },
    });
    expect(await service.migratePost('p')).toBe('migrated');
    expect(old.terminate).toHaveBeenCalledTimes(1);
  });
  it('nao retoma termino feito por outra operacao', async () => {
    old.describe.mockResolvedValue({
      type: 'postWorkflowV102',
      runId: 'old',
      status: { name: 'TERMINATED' },
    });
    history.events.push({
      workflowExecutionTerminatedEventAttributes: { reason: 'user' },
    });
    expect(await service.migratePost('p')).toBe('deferred');
    expect(client.workflow.start).not.toHaveBeenCalled();
  });
  it('nao toca workflow que ja agendou publicacao', async () => {
    history.events.push(mutation);
    expect(await service.migratePost('p')).toBe('deferred');
    expect(old.terminate).not.toHaveBeenCalled();
  });
  it('confere historico FINAL antes de criar substituto', async () => {
    old.terminate.mockImplementation(async () => {
      history.events.push(mutation, {
        workflowExecutionTerminatedEventAttributes: {
          reason: V112_MIGRATION_REASON,
        },
      });
    });
    expect(await service.migratePost('p')).toBe('deferred');
    expect(client.workflow.start).not.toHaveBeenCalled();
  });
  it('preserva vencedor concorrente legado sem afirmar migracao', async () => {
    client.workflow.start.mockImplementation(async () => old);
    expect(await service.migratePost('p')).toBe('deferred');
    expect(old.terminate).toHaveBeenCalledTimes(1);
  });
  it('confere identidade do vencedor V112', async () => {
    winner.fetchHistory.mockResolvedValue({
      events: [
        {
          workflowExecutionStartedEventAttributes: {
            input: {
              payloads: [payload({ postId: 'outro', organizationId: 'o' })],
            },
          },
        },
      ],
    });
    expect(await service.migratePost('p')).toBe('deferred');
  });
  it('nao migra publicado, cancelado, passado ou filho excluido pelo repository', async () => {
    repo.findCandidate.mockResolvedValue(null);
    expect(await service.migratePost('p')).toBe('deferred');
    expect(client.workflow.getHandle).not.toHaveBeenCalled();
  });
  it('adia janela proxima sem terminar workflow', async () => {
    candidate.publishDate = new Date(base.getTime() + 60000);
    expect(await service.migratePost('p')).toBe('deferred');
    expect(old.terminate).not.toHaveBeenCalled();
  });
  it('nao migra snapshot com data alterada', async () => {
    candidate.publishDate = new Date(base.getTime() + 7200000);
    expect(await service.migratePost('p')).toBe('deferred');
    expect(old.terminate).not.toHaveBeenCalled();
  });
  it('revalida cancelamento antes de terminar', async () => {
    repo.findCandidate.mockResolvedValueOnce(candidate).mockResolvedValue(null);
    expect(await service.migratePost('p')).toBe('deferred');
    expect(old.terminate).not.toHaveBeenCalled();
  });
  it('revalida edicao antes de iniciar substituto', async () => {
    repo.findCandidate
      .mockResolvedValueOnce(candidate)
      .mockResolvedValueOnce(candidate)
      .mockResolvedValue({
        ...candidate,
        updatedAt: new Date(base.getTime() + 1),
      });
    expect(await service.migratePost('p')).toBe('deferred');
    expect(client.workflow.start).not.toHaveBeenCalled();
  });
  it('revalidacao lenta nao permite terminar dentro da janela de publicacao', async () => {
    repo.findCandidate
      .mockResolvedValueOnce(candidate)
      .mockImplementationOnce(async () => {
        jest.setSystemTime(new Date(base.getTime() + 3500000));
        return candidate;
      });
    expect(await service.migratePost('p')).toBe('deferred');
    expect(old.terminate).not.toHaveBeenCalled();
  });
  it('timer disparado nao oferece prova de espera', async () => {
    history.events.push({ timerFiredEventAttributes: { timerId: '1' } });
    expect(await service.migratePost('p')).toBe('deferred');
    expect(old.terminate).not.toHaveBeenCalled();
  });
  it('lote isola falha e devolve cursor para retomada', async () => {
    jest
      .spyOn(service, 'migratePost')
      .mockRejectedValueOnce(new Error('offline'));
    const result = await service.migrateBatch();
    expect(result).toMatchObject({ scanned: 1, errors: 1, migrated: 0 });
    expect(repo.listCandidates).toHaveBeenCalledWith(undefined);
  });
  it('bootstrap usa singleton sem encerrar concorrentes', async () => {
    await service.ensureMigrationWorkflow();
    expect(client.workflow.start).toHaveBeenCalledWith(
      'migratePostWorkflowsV112',
      expect.objectContaining({
        workflowId: 'migrate-post-workflows-v112',
        taskQueue: 'main',
        workflowIdConflictPolicy: 'USE_EXISTING',
      })
    );
  });
});
