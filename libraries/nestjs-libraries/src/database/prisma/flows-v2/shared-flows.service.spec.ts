import { SharedFlowsService } from './shared-flows.service';
import { simpleDefinition } from './flow-definition';
describe('automacoes compartilhadas', () => {
  it('revisao antiga nao envia apos edicao ativa', async () => {
    const repo = { execution: jest.fn().mockResolvedValue({ flow: { status: 'ACTIVE', revision: 3 }, revision: 2 }), running: jest.fn() };
    const channels = { prepare: jest.fn() };
    const service = new SharedFlowsService(repo as any, channels as any);
    expect(await service.startExecution('x')).toBeNull();
    expect(await service.deliver('x', 'private:dm')).toBe('CANCELLED');
    expect(channels.prepare).not.toHaveBeenCalled();
    expect(repo.running).not.toHaveBeenCalled();
  });
  it('delega a consulta de publicacao com o escopo original sem salvar automacao', async () => {
    const channels = {
      resolvePost: jest.fn().mockResolvedValue({ post: { id: '123_456' } }),
    };
    const repo = { save: jest.fn() };
    const service = new SharedFlowsService(repo as any, channels as any);
    const scope = { organizationId: 'org', profileId: 'profile' };
    expect(await service.resolvePost(scope, 'channel', '456')).toEqual({
      post: { id: '123_456' },
    });
    expect(channels.resolvePost).toHaveBeenCalledWith(scope, 'channel', '456');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('recusa Messenger em Instagram, multiplos canais ou publicacao especifica', async () => {
    const repo = {
      integration: jest.fn().mockResolvedValue({
        providerIdentifier: 'instagram',
        internalId: '123',
      }),
      save: jest.fn(),
    };
    const service = new SharedFlowsService(repo as any, {} as any);
    const scope = { organizationId: 'org', profileId: 'profile' };
    const input = {
      name: 'Messenger',
      channels: [
        {
          integrationId: 'i',
          postMode: 'all' as const,
          postIds: [] as string[],
        },
      ],
      definition: simpleDefinition({
        triggerType: 'messenger_message',
        priority: 10,
        keywords: ['link'],
        message: 'Oi',
      }),
    };
    await expect(service.save(scope, input)).rejects.toThrow(
      'MESSENGER_FACEBOOK_ONLY'
    );
    repo.integration.mockResolvedValue({
      providerIdentifier: 'facebook',
      internalId: '123',
    });
    await expect(
      service.save(scope, {
        ...input,
        channels: [
          { ...input.channels[0], postMode: 'specific', postIds: ['123_456'] },
        ],
      })
    ).rejects.toThrow('MESSENGER_POST_TARGET_UNSUPPORTED');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('retoma com texto publico do snapshot e nao repete entrega aceita', async () => {
    const action = {
      key: 'public:reply',
      kind: 'public_reply',
      text: 'Segunda escolhida',
      delaySeconds: 0,
    };
    const repo = {
      execution: jest.fn().mockResolvedValue({
        id: 'x',
        integrationId: 'i',
        flow: { status: 'ACTIVE', revision: 1 },
        revision: 1,
        snapshot: {
          actions: [action],
          definition: simpleDefinition({
            message: 'Nao replanejar',
            reply: 'Outra',
          }),
          event: { externalEventId: '123' },
        },
      }),
      previousDelivery: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ status: 'SENT' }),
      reserveEffect: jest
        .fn()
        .mockResolvedValue({ send: true, id: 'delivery' }),
      delivered: jest.fn(),
    };
    const send = jest
      .fn()
      .mockResolvedValue({ status: 'SENT', remoteId: '789' });
    const transport = {
      prepare: jest
        .fn()
        .mockRejectedValueOnce(new Error('preflight temporarily failed'))
        .mockResolvedValue(send),
    };
    const service = new SharedFlowsService(repo as any, transport as any);
    expect(await service.deliver('x', action.key)).toBe('UNKNOWN');
    expect(send).not.toHaveBeenCalled();
    expect(await service.deliver('x', action.key)).toBe('SENT');
    expect(await service.deliver('x', action.key)).toBe('SENT');
    expect(transport.prepare).toHaveBeenCalledTimes(2);
    for (const call of transport.prepare.mock.calls)
      expect(call[3]).toEqual(action);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('ativa Facebook e Instagram com a restricao local vazia e valida cada canal no perfil', async () => {
    const beforeEnabled = process.env.SHARED_AUTOMATIONS_ENABLED;
    const beforeGate = process.env.SHARED_AUTOMATION_TEST_INTEGRATION;
    process.env.SHARED_AUTOMATIONS_ENABLED = 'true';
    process.env.SHARED_AUTOMATION_TEST_INTEGRATION = '';
    try {
      const scope = { organizationId: 'org', profileId: 'profile' };
      const channels = ['fb', 'ig'].map((integrationId) => ({
        integrationId,
        postIds: ['123'],
      }));
      const repo = {
        get: jest.fn().mockResolvedValue({ id: 'flow', revision: 2, channels }),
        channels: jest.fn().mockResolvedValue([]),
        setStatus: jest.fn(),
      };
      const transport = {
        readiness: jest.fn().mockResolvedValue({ ready: true }),
        assertPost: jest.fn(),
      };
      const service = new SharedFlowsService(repo as any, transport as any);
      await service.status(scope, 'flow', 2, 'ACTIVE');
      for (const channel of channels) {
        expect(transport.readiness).toHaveBeenCalledWith(
          scope,
          channel.integrationId
        );
        expect(transport.assertPost).toHaveBeenCalledWith(
          scope,
          channel.integrationId,
          '123'
        );
      }
      expect(repo.setStatus).toHaveBeenCalledWith(scope, 'flow', 2, 'ACTIVE');
      repo.setStatus.mockClear();
      process.env.SHARED_AUTOMATION_TEST_INTEGRATION = 'fb';
      await expect(service.status(scope, 'flow', 2, 'ACTIVE')).rejects.toThrow(
        'LOCAL_TEST_CHANNEL_ONLY'
      );
      expect(repo.setStatus).not.toHaveBeenCalled();
    } finally {
      if (beforeEnabled === undefined)
        delete process.env.SHARED_AUTOMATIONS_ENABLED;
      else process.env.SHARED_AUTOMATIONS_ENABLED = beforeEnabled;
      if (beforeGate === undefined)
        delete process.env.SHARED_AUTOMATION_TEST_INTEGRATION;
      else process.env.SHARED_AUTOMATION_TEST_INTEGRATION = beforeGate;
    }
  });
  it('recusa duas Paginas na mesma definicao e nao salva', async () => {
    const repo = {
      integration: jest.fn().mockResolvedValue({
        providerIdentifier: 'facebook',
        internalId: '123',
      }),
      save: jest.fn(),
    };
    const service = new SharedFlowsService(repo as any, {} as any);
    await expect(
      service.save(
        { organizationId: 'o', profileId: 'p' },
        {
          name: 'Teste',
          channels: ['a', 'b'].map((integrationId) => ({
            integrationId,
            postMode: 'all',
            postIds: [],
          })),
          definition: simpleDefinition({ message: 'Oi' }),
        }
      )
    ).rejects.toThrow('ONE_CHANNEL_PER_PLATFORM');
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('nao envia novamente quando a reserva ficou incerta', async () => {
    const repo = {
      previousDelivery: jest.fn().mockResolvedValue(null),
      execution: jest.fn().mockResolvedValue({
        id: 'x',
        status: 'RUNNING',
        flow: { status: 'ACTIVE', revision: 1 },
        revision: 1,
        snapshot: {
          actions: [
            {
              key: 'private_reply',
              kind: 'private_reply',
              text: 'Oi',
              delaySeconds: 0,
            },
          ],
          event: { externalEventId: '123' },
        },
      }),
      reserveEffect: jest
        .fn()
        .mockResolvedValue({ send: false, status: 'UNKNOWN' }),
    };
    const transport = { prepare: jest.fn().mockResolvedValue(jest.fn()) };
    const service = new SharedFlowsService(repo as any, transport as any);
    expect(await service.deliver('x', 'private_reply')).toBe('UNKNOWN');
    expect(transport.prepare.mock.results[0].value).toBeDefined();
  });
  it('pausa impede efeito antes de resolver token', async () => {
    const repo = {
      execution: jest
        .fn()
        .mockResolvedValue({ flow: { status: 'PAUSED' }, snapshot: {} }),
    };
    const transport = { prepare: jest.fn() };
    const service = new SharedFlowsService(repo as any, transport as any);
    expect(await service.deliver('x', 'private_reply')).toBe('CANCELLED');
    expect(transport.prepare).not.toHaveBeenCalled();
  });
});
