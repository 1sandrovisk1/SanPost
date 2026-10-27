import { SharedFlowsRepository } from './shared-flows.repository';
import { simpleDefinition } from './flow-definition';
import { randomInt } from 'node:crypto';
jest.mock('node:crypto', () => ({
  ...jest.requireActual('node:crypto'),
  randomInt: jest.fn(),
}));
describe('persistencia compartilhada', () => {
  it('persiste a variacao escolhida e nao sorteia novamente no webhook duplicado', async () => {
    const choose = randomInt as jest.Mock;
    choose.mockReset().mockReturnValue(1);
    const definition = simpleDefinition({ message: 'Link', reply: 'Original' });
    definition.nodes[1].data =
      '{"messages":["Primeira","Ola {{comment_name}}"]}';
    const tx = {
      $queryRaw: jest.fn(),
      integration: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ providerIdentifier: 'facebook' }),
      },
      flowChannel: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 'channel',
              flowId: 'flow',
              activatedAt: new Date(0),
              postMode: 'all',
              flow: { revision: 1, definition },
            },
          ]),
      },
      automationEvent: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValue({ id: 'event' }),
        create: jest.fn().mockResolvedValue({ id: 'event' }),
      },
      flowExecutionV2: { create: jest.fn() },
      automationDispatch: { create: jest.fn() },
    };
    const repo = new SharedFlowsRepository({
      $transaction: (fn: (value: typeof tx) => unknown) => fn(tx),
    } as any);
    const event = {
      organizationId: 'o',
      profileId: 'p',
      integrationId: 'i',
      platform: 'facebook' as const,
      remoteAccountId: '123',
      externalEventId: '456',
      externalPostId: '123_789',
      externalActorId: 'actor',
      actorName: 'Ana',
      text: 'link',
      occurredAt: 10,
    };
    expect(await repo.ingest(event)).toHaveLength(1);
    const snapshot = tx.flowExecutionV2.create.mock.calls[0][0].data.snapshot;
    expect(snapshot.actions.map((a: { text: string }) => a.text)).toEqual([
      'Ola Ana',
      'Link',
    ]);
    expect(snapshot.definition).toEqual(definition);
    expect(choose).toHaveBeenCalledWith(2);
    expect(await repo.ingest(event)).toEqual([]);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(tx.flowExecutionV2.create).toHaveBeenCalledTimes(1);
    expect(tx.automationDispatch.create).toHaveBeenCalledTimes(1);
  });
  it('exige perfil e organizacao inclusive nas leituras', () => {
    const repo = new SharedFlowsRepository({} as any);
    expect(() => repo.list({ organizationId: 'o', profileId: '' })).toThrow(
      'PROFILE_REQUIRED'
    );
  });
  it('isola a lista por perfil e versao sem expor integracoes completas', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repo = new SharedFlowsRepository({ flow: { findMany } } as any);
    await repo.list({ organizationId: 'o', profileId: 'p' });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      organizationId: 'o',
      profileId: 'p',
      executionVersion: 2,
      deletedAt: null,
    });
    expect(findMany.mock.calls[0][0].include.integration).toBeUndefined();
  });
  it('reserva incerta existente nunca permite novo envio', async () => {
    const delivery = { status: 'SENDING', executionId: 'x' };
    const tx = {
      $queryRaw: jest.fn(),
      flowDelivery: { findUnique: jest.fn().mockResolvedValue(delivery) },
    };
    const db = { $transaction: jest.fn((fn) => fn(tx)) };
    const repo = new SharedFlowsRepository(db as any);
    const result = await repo.reserveEffect(
      {
        id: 'x',
        platform: 'facebook',
        remoteAccountId: '123',
        eventId: 'e',
        flowId: 'f',
        revision: 1,
      } as any,
      '456',
      {
        key: 'private_reply',
        kind: 'private_reply',
        text: 'Oi',
        delaySeconds: 0,
      }
    );
    expect(result.send).toBe(false);
    expect(result.status).toBe('UNKNOWN');
  });
});
