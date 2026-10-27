jest.mock('../../database/prisma/flows/flows.service', () => ({
  FlowsService: jest.fn(),
}));
jest.mock('./comment-channel.service', () => ({
  CommentChannelService: jest.fn(),
}));
import { ScheduledAutomationProcessor } from './scheduled-automation.processor';
const event = {
  organizationId: 'o',
  profileId: 'p',
  integrationId: 'i',
  platform: 'instagram',
  remoteAccountId: '123',
  externalPostId: '99',
  externalEventId: '100',
  occurredAt: Date.now(),
  text: 'quero',
  externalActorId: '88',
};
const time = new Date(Date.now() - 1000);
const makeTarget = (): any => ({
  id: 't',
  flowId: 'f',
  integrationId: 'i',
  boundPostIds: [],
  flow: {
    organizationId: 'o',
    profileId: 'p',
    revision: 1,
    updatedAt: time,
    status: 'ACTIVE',
    executionVersion: 1,
  },
  post: {
    organizationId: 'o',
    profileId: 'p',
    integrationId: 'i',
    state: 'PUBLISHED',
    settings: '{}',
    releaseId: '99',
  },
});
describe('reconciliacao duravel do agendamento', () => {
  let target: any,
    repo: any,
    legacy: any,
    shared: any,
    channel: any,
    processor: ScheduledAutomationProcessor;
  beforeEach(() => {
    target = makeTarget();
    repo = {
      cleanup: jest.fn(),
      claimDeferredNext: jest.fn().mockResolvedValue([]),
      finishDeferredNext: jest.fn(),
      isReserved: jest.fn().mockResolvedValue(false),
      unresolvedForNext: jest.fn().mockResolvedValue([]),
      claim: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'e',
            targetId: 't',
            revision: 1,
            flowUpdatedAt: time,
            event,
            expiresAt: new Date(Date.now() + 100000),
          },
        ]),
      target: jest.fn().mockImplementation(async () => target),
      integration: jest
        .fn()
        .mockResolvedValue({
          internalId: '123',
          providerIdentifier: 'instagram',
        }),
      bind: jest.fn().mockImplementation(async (_id: string, ids: string[]) => {
        target.boundPostIds = ids;
      }),
      finish: jest.fn(),
    };
    legacy = { handleIncomingComment: jest.fn().mockResolvedValue([]) };
    shared = { ingest: jest.fn().mockResolvedValue([]) };
    channel = { scheduledPublishedIds: jest.fn().mockResolvedValue(['99']) };
    processor = new ScheduledAutomationProcessor(
      { repository: repo } as any,
      legacy,
      shared,
      channel
    );
  });
  it('retoma proxima publicacao sem depender da automacao agendada original', async () => {
    process.env.SHARED_AUTOMATIONS_ENABLED = 'true';
    const candidates = [{ id: 'next', revision: 2, updatedAt: time.toISOString(), executionVersion: 2 }];
    repo.claimDeferredNext.mockResolvedValue([{ id: 'next-event', organizationId: 'o', profileId: 'p', integrationId: 'i', event, candidates, expiresAt: new Date(Date.now() + 100000) }]);
    repo.claim.mockResolvedValue([]);
    await processor.tick();
    expect(shared.ingest).toHaveBeenCalledWith(event, undefined, candidates);
    expect(repo.finishDeferredNext).toHaveBeenCalledWith('next-event', 'DONE');
  });
  it('conserva evento antecipado e despacha uma vez quando o resultado chega', async () => {
    target.post.state = 'QUEUE';
    target.post.releaseId = null;
    await processor.tick();
    expect(legacy.handleIncomingComment).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'PENDING');
    target.post.state = 'PUBLISHED';
    target.post.releaseId = '99';
    await processor.tick();
    expect(legacy.handleIncomingComment).toHaveBeenCalledWith(
      expect.objectContaining({ igMediaId: '99' }),
      'f',
      expect.objectContaining({ targetId: 't' })
    );
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'DONE');
  });
  it.each(['PAUSED', 'ARCHIVED'])('descarta regra %s', async (status) => {
    target.flow.status = status;
    await processor.tick();
    expect(legacy.handleIncomingComment).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'SKIPPED');
  });
  it.each([
    { profileId: 'other' },
    { integrationId: 'other' },
    { deletedAt: new Date() },
    { parentPostId: 'parent' },
    { intervalInDays: 7 },
    { settings: '{"post_type":"story"}' },
  ])('revalida post mutado %j', async (change) => {
    Object.assign(target.post, change);
    await processor.tick();
    expect(legacy.handleIncomingComment).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'SKIPPED');
  });
  it('descarta definicao editada desde a captura', async () => {
    target.flow.updatedAt = new Date();
    await processor.tick();
    expect(legacy.handleIncomingComment).not.toHaveBeenCalled();
  });
  it('nao associa video do Facebook por concatenacao', async () => {
    event.platform = 'facebook';
    repo.integration.mockResolvedValue({
      internalId: '123',
      providerIdentifier: 'facebook',
    });
    channel.scheduledPublishedIds.mockRejectedValue(new Error('not ready'));
    await processor.tick();
    expect(shared.ingest).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'PENDING');
    event.platform = 'instagram';
  });
  it('retry conserva fila quando o worker cai antes de iniciar Temporal', async () => {
    legacy.handleIncomingComment.mockRejectedValueOnce(new Error('offline'));
    await processor.tick();
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'PENDING');
    await processor.tick();
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'DONE');
  });
  it('vinculo congelado nao acompanha outra republicacao', async () => {
    target.boundPostIds = ['98'];
    target.post.releaseId = '99';
    await processor.tick();
    expect(legacy.handleIncomingComment).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenLastCalledWith('e', 'SKIPPED');
  });
});
