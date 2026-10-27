import 'reflect-metadata';
import { FacebookAutomationProofService } from './facebook-automation-proof.service';

describe('FacebookAutomationProofService', () => {
  const context = {
    organizationId: 'org',
    profileId: 'profile',
    userId: 'user',
  };
  const config = {
    organizationId: 'org',
    profileId: 'profile',
    integrationId: 'integration',
    appId: '456',
    pageId: '123',
    postId: '123_789',
    commentId: '789_321',
    text: 'Teste https://example.com',
    ledgerId: 'a'.repeat(64),
  };
  const connection = {
    ...context,
    integrationId: 'integration',
    pageId: '123',
    appId: '456',
    appSecret: 'SECRET',
    pageToken: 'TOKEN',
  };
  let repository: any,
    setup: any,
    receipts: any,
    graph: any,
    service: FacebookAutomationProofService;
  beforeEach(() => {
    repository = {
      config: jest.fn().mockResolvedValue(config),
      read: jest.fn().mockResolvedValue(null),
      reserve: jest.fn(),
      complete: jest.fn(),
    };
    setup = {
      authorizedConnection: jest.fn().mockResolvedValue(connection),
      inspectReceiving: jest
        .fn()
        .mockResolvedValue({ stage: 'RECEIVING_READY' }),
    };
    receipts = {
      getReceipt: jest.fn().mockResolvedValue({
        receivedAt: new Date().toISOString(),
        commentId: config.commentId,
        postId: config.postId,
      }),
    };
    graph = {
      read: jest.fn().mockResolvedValue({
        id: config.commentId,
        created_time: new Date(Date.now() - 60000).toISOString(),
        can_reply_privately: true,
      }),
      write: jest
        .fn()
        .mockResolvedValue({ status: 'SENT', remoteId: 'mid.123' }),
    };
    service = new FacebookAutomationProofService(
      repository,
      setup,
      receipts,
      graph
    );
  });
  async function send() {
    const preview = await service.view(context, 'integration');
    if (!preview.available) throw Error();
    return service.send(context, 'integration', {
      revision: preview.revision!,
    });
  }
  it('GET mostra previa sem Graph nem reserva e sem credenciais', async () => {
    const view = await service.view(context, 'integration');
    expect(view).toMatchObject({
      available: true,
      text: config.text,
      canSend: true,
    });
    expect(JSON.stringify(view)).not.toMatch(/SECRET|TOKEN|ledgerId/);
    expect(graph.read).not.toHaveBeenCalled();
    expect(repository.reserve).not.toHaveBeenCalled();
  });
  it.each([
    { ...context, organizationId: 'other' },
    { ...context, profileId: 'other' },
    { ...context, userId: '' },
  ])('isola contexto sem efeito remoto', async (ctx) => {
    expect(await service.view(ctx, 'integration')).toEqual({
      available: false,
    });
    await expect(
      service.send(ctx, 'integration', { revision: 'a'.repeat(64) })
    ).rejects.toThrow();
    expect(setup.authorizedConnection).not.toHaveBeenCalled();
    expect(graph.read).not.toHaveBeenCalled();
    expect(repository.reserve).not.toHaveBeenCalled();
  });
  it('desativa sem config ou com outra integracao', async () => {
    expect(await service.view(context, 'other')).toEqual({ available: false });
    repository.config.mockResolvedValue(null);
    expect(await service.view(context, 'integration')).toEqual({
      available: false,
    });
  });
  it('envia somente texto e comentario fixos pelo adaptador', async () => {
    const view = await send();
    expect(view).toMatchObject({
      result: { status: 'SENT', remoteId: 'mid.123' },
      canSend: false,
    });
    expect(graph.write).toHaveBeenCalledTimes(1);
    expect(graph.write).toHaveBeenCalledWith(
      '123/messages',
      'TOKEN',
      { recipient: { comment_id: '789_321' }, message: { text: config.text } },
      'message_id'
    );
    expect(repository.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      graph.write.mock.invocationCallOrder[0]
    );
  });
  it.each([
    null,
    { commentId: '789_999', postId: config.postId },
    { commentId: config.commentId, postId: '123_999' },
  ])('bloqueia recibo ausente ou diferente', async (receipt) => {
    receipts.getReceipt.mockResolvedValue(receipt);
    await expect(send()).rejects.toThrow();
    expect(graph.write).not.toHaveBeenCalled();
  });
  it.each([
    { id: '789_999' },
    { can_reply_privately: false },
    { can_reply_privately: undefined },
    { created_time: new Date(0).toISOString() },
    { created_time: 'invalid' },
    { created_time: new Date(Date.now() + 86400000).toISOString() },
  ])('bloqueia comentario inelegivel %p', async (override) => {
    graph.read.mockResolvedValue({
      id: config.commentId,
      can_reply_privately: true,
      created_time: new Date().toISOString(),
      ...override,
    });
    await expect(send()).rejects.toThrow();
    expect(repository.reserve).not.toHaveBeenCalled();
    expect(graph.write).not.toHaveBeenCalled();
  });
  it.each([
    'AUTHORIZATION_REQUIRED',
    'CALLBACK_CONFLICT',
    'CHECK_FAILED',
    'CALLBACK_REQUIRED',
  ])('bloqueia preflight %s', async (stage) => {
    setup.inspectReceiving.mockResolvedValue({ stage });
    await expect(send()).rejects.toThrow();
    expect(graph.write).not.toHaveBeenCalled();
  });
  it('rejeita revisao antiga antes de Graph', async () => {
    await expect(
      service.send(context, 'integration', { revision: 'b'.repeat(64) })
    ).rejects.toThrow();
    expect(graph.read).not.toHaveBeenCalled();
  });
  it('revalida rotacao somente do Page token durante consultas', async () => {
    graph.read.mockImplementation(async () => {
      setup.authorizedConnection.mockResolvedValue({
        ...connection,
        pageToken: 'NEW',
      });
      return {
        id: config.commentId,
        created_time: new Date().toISOString(),
        can_reply_privately: true,
      };
    });
    await expect(send()).rejects.toThrow();
    expect(repository.reserve).not.toHaveBeenCalled();
  });
  it('revalida configuracao e recibo apos consultas', async () => {
    graph.read.mockImplementation(async () => {
      repository.config.mockResolvedValue({ ...config, text: 'changed' });
      return {
        id: config.commentId,
        created_time: new Date().toISOString(),
        can_reply_privately: true,
      };
    });
    await expect(send()).rejects.toThrow();
    expect(repository.reserve).not.toHaveBeenCalled();
  });
  it.each(['SENT', 'FAILED', 'UNKNOWN', 'SENDING'])(
    'mantem reserva %s mesmo sem recibo',
    async (status) => {
      repository.read.mockResolvedValue({ status });
      receipts.getReceipt.mockResolvedValue(null);
      expect(await service.view(context, 'integration')).toMatchObject({
        result: { status },
        canSend: false,
      });
      await send();
      expect(graph.read).not.toHaveBeenCalled();
      expect(graph.write).not.toHaveBeenCalled();
    }
  );
  it('falha de reserva nao envia', async () => {
    repository.reserve.mockRejectedValue(Error('fsync'));
    await expect(send()).rejects.toThrow();
    expect(graph.write).not.toHaveBeenCalled();
  });
  it('concorrencia permite somente um POST', async () => {
    let reserved = false;
    repository.reserve.mockImplementation(async () => {
      if (reserved) throw Error('PROOF_ALREADY_RESERVED');
      reserved = true;
    });
    await Promise.allSettled([send(), send()]);
    expect(graph.write).toHaveBeenCalledTimes(1);
  });
  it('timeout e erro de persistencia nunca liberam a reserva', async () => {
    graph.write.mockRejectedValue(Error('secret url'));
    repository.complete.mockRejectedValue(Error('disk'));
    expect(await send()).toMatchObject({
      result: { status: 'UNKNOWN' },
      canSend: false,
    });
    expect(graph.write).toHaveBeenCalledTimes(1);
    expect(repository.complete).toHaveBeenCalled();
  });
  it('sucesso remoto com falha ao gravar vira UNKNOWN sem repetir POST', async () => {
    repository.complete.mockRejectedValue(Error('disk'));
    expect(await send()).toMatchObject({
      result: { status: 'UNKNOWN' },
      canSend: false,
    });
    expect(graph.write).toHaveBeenCalledTimes(1);
    expect(repository.complete).toHaveBeenCalledWith(config, {
      status: 'SENT',
      remoteId: 'mid.123',
    });
  });
  it.each([{ pageId: '999' }, { appId: '999' }])(
    'bloqueia conexao divergente antes de Graph %p',
    async (override) => {
      setup.authorizedConnection.mockResolvedValue({
        ...connection,
        ...override,
      });
      await expect(send()).rejects.toThrow();
      expect(graph.read).not.toHaveBeenCalled();
      expect(repository.reserve).not.toHaveBeenCalled();
    }
  );
});
