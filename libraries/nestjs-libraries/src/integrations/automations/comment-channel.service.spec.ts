import { CommentChannelService } from './comment-channel.service';
import {
  MetaAutomationGraphClient,
  MetaAutomationError,
} from './meta-automation-graph.client';
import { resolveIgRoute } from '../social/instagram-route.resolver';
jest.mock('../social/instagram-route.resolver', () => ({
  resolveIgRoute: jest.fn(),
}));
jest.mock('../../crypto/integration-token.helper', () => ({
  decryptIntegrationToken: (_: unknown, token: string) => token,
}));
const scope = { organizationId: 'org', profileId: 'profile' };
const event = {
  ...scope,
  integrationId: 'channel',
  platform: 'facebook' as const,
  remoteAccountId: '123',
  externalEventId: '456_789',
  externalPostId: '123_456',
  externalActorId: '999',
  text: 'link',
  occurredAt: Date.now() - 1000,
};
const action = {
  key: 'private_reply',
  kind: 'private_reply' as const,
  text: 'https://example.com',
  delaySeconds: 0,
};
describe('canal de comentarios', () => {
  let repo: any;
  let facebook: any;
  let service: CommentChannelService;
  let read: jest.SpyInstance;
  let write: jest.SpyInstance;
  beforeEach(() => {
    delete process.env.SHARED_AUTOMATION_TEST_INTEGRATION;
    (resolveIgRoute as jest.Mock).mockReset();
    repo = {
      integration: jest.fn().mockResolvedValue({
        id: 'channel',
        internalId: '123',
        providerIdentifier: 'facebook',
        token: 'fixture',
      }),
    };
    facebook = {
      authorizedPostLookup: jest
        .fn()
        .mockResolvedValue({ pageId: '123', pageToken: 'fixture' }),
      authorizedAccount: jest
        .fn()
        .mockResolvedValue({ pageId: '123', pageToken: 'fixture' }),
      inspectAccount: jest.fn().mockResolvedValue({ stage: 'RECEIVING_READY' }),
      inspectMessengerAccount: jest
        .fn()
        .mockResolvedValue({ stage: 'RECEIVING_READY' }),
    };
    service = new CommentChannelService(
      repo,
      facebook,
      {} as any,
      {} as any,
      {} as any
    );
    read = jest
      .spyOn(MetaAutomationGraphClient.prototype, 'read')
      .mockResolvedValue({
        id: event.externalEventId,
        created_time: new Date(event.occurredAt).toISOString(),
        can_reply_privately: true,
      });
    write = jest
      .spyOn(MetaAutomationGraphClient.prototype, 'write')
      .mockResolvedValue({ status: 'SENT', remoteId: 'mid.test' });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.SHARED_AUTOMATION_TEST_INTEGRATION;
  });
  it('resolve video somente pela relacao comprovada nas anexacoes do post', async () => {
    read.mockResolvedValue({
      data: [
        { id: '123_456', attachments: { data: [{ target: { id: '777' } }] } },
      ],
    });
    expect(
      await service.scheduledPublishedIds(scope, 'channel', '777')
    ).toEqual(['123_456']);
    expect(read).toHaveBeenCalledWith(
      '123/published_posts',
      'fixture',
      expect.objectContaining({
        fields: expect.stringContaining('attachments'),
      })
    );
    expect(write).not.toHaveBeenCalled();
  });
  it('recusa video sem prova e id composto de outra Pagina', async () => {
    read.mockResolvedValue({
      data: [
        { id: '999_456', attachments: { data: [{ target: { id: '777' } }] } },
      ],
    });
    await expect(
      service.scheduledPublishedIds(scope, 'channel', '777')
    ).rejects.toThrow('PUBLICATION_ID_PENDING');
    await expect(
      service.scheduledPublishedIds(scope, 'channel', '999_456')
    ).rejects.toThrow('PUBLICATION_ID_PENDING');
  });
  it.each(['456', 'https://www.facebook.com/789/posts/456'])(
    'localiza publicacao %s sem salvar, enviar ou listar anuncios',
    async (reference) => {
      read.mockResolvedValue({
        id: '123_456',
        from: { id: '123' },
        message: 'Publicacao de anuncio',
        permalink_url: 'https://www.facebook.com/123/posts/456',
        full_picture: 'https://scontent.test.fbcdn.net/image.jpg',
        created_time: '2026-10-26T12:00:00Z',
        access_token: 'DO-NOT-RETURN',
      });
      const result = await service.resolvePost(scope, 'channel', reference);
      expect(result).toEqual({
        post: {
          id: '123_456',
          caption: 'Publicacao de anuncio',
          permalink: 'https://www.facebook.com/123/posts/456',
          thumbnailUrl: 'https://scontent.test.fbcdn.net/image.jpg',
          timestamp: '2026-10-26T12:00:00Z',
        },
      });
      expect(repo.integration).toHaveBeenCalledWith(scope, 'channel');
      expect(facebook.authorizedPostLookup).toHaveBeenCalledWith(
        scope,
        'channel'
      );
      expect(read).toHaveBeenCalledTimes(1);
      expect(read.mock.calls[0].slice(0, 2)).toEqual(['123_456', 'fixture']);
      expect(write).not.toHaveBeenCalled();
    }
  );
  it('preserva o ID do Page Post quando o permalink retornado aponta para Reel', async () => {
    // Formato observado na consulta real do Escorpiano; IDs e texto substituidos.
    // Nao representa captura de webhook nem homologa comentarios de Reels.
    read
      .mockResolvedValueOnce({
        id: '123_456',
        from: { id: '123' },
        message: 'Video de teste',
        permalink_url: 'https://www.facebook.com/reel/789/',
      })
      .mockResolvedValueOnce({
        id: '789',
        from: { id: '123' },
        post_id: '456',
      });

    const { post } = await service.resolvePost(scope, 'channel', '456');

    expect(post).toMatchObject({
      id: '123_456',
      caption: 'Video de teste',
      permalink: 'https://www.facebook.com/reel/789/',
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[1].slice(0, 2)).toEqual(['789', 'fixture']);
    expect(write).not.toHaveBeenCalled();
    expect(resolveIgRoute).not.toHaveBeenCalled();
  });
  const videoPost = (id: string) => ({
    id,
    from: { id: '123' },
    message: 'Dark video',
    attachments: { data: [{ media_type: 'video', target: { id: '789' } }] },
    permalink_url: 'https://www.facebook.com/reel/789/',
  });
  it.each(['789', '123_789', 'https://www.facebook.com/reel/789/'])(
    'resolve %s pelo post_id mesmo quando Meta aceita Pagina_video',
    async (reference) => {
      read
        .mockResolvedValueOnce(videoPost('123_789'))
        .mockResolvedValueOnce({
          id: '789',
          from: { id: '123' },
          post_id: '456',
        })
        .mockResolvedValueOnce(videoPost('123_456'));
      expect(
        await service.resolvePost(scope, 'channel', reference)
      ).toMatchObject({ post: { id: '123_456', caption: 'Dark video' } });
      expect(read.mock.calls.map((call) => call[0])).toEqual([
        '123_789',
        '789',
        '123_456',
      ]);
      expect(write).not.toHaveBeenCalled();
    }
  );
  it('consulta video quando a referencia composta nao existe no Graph', async () => {
    read
      .mockRejectedValueOnce(new MetaAutomationError('META_REJECTED', 100))
      .mockResolvedValueOnce({
        id: '789',
        from: { id: '123' },
        post_id: '123_456',
      })
      .mockResolvedValueOnce(videoPost('123_456'));
    expect(await service.resolvePost(scope, 'channel', '789')).toMatchObject({
      post: { id: '123_456' },
    });
  });
  it.each([
    { id: '789', from: { id: '999' }, post_id: '456' },
    { id: '888', from: { id: '123' }, post_id: '456' },
    { id: '789', from: { id: '123' } },
    { id: '789', from: { id: '123' }, post_id: '999_456' },
    { id: '789', from: { id: '123' }, post_id: 'https://evil.test/456' },
  ])('recusa relacao de video nao comprovada %j', async (video) => {
    read
      .mockResolvedValueOnce(videoPost('123_789'))
      .mockResolvedValueOnce(video);
    await expect(
      service.resolvePost(scope, 'channel', '789')
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });
  it.each([
    { ...videoPost('123_456'), from: { id: '999' } },
    { ...videoPost('123_999') },
    {
      ...videoPost('123_456'),
      attachments: { data: [] },
      permalink_url: 'https://facebook.com/123/posts/456',
    },
  ])('recusa Page Post sem relacao com o video %j', async (post) => {
    read
      .mockResolvedValueOnce(videoPost('123_789'))
      .mockResolvedValueOnce({ id: '789', from: { id: '123' }, post_id: '456' })
      .mockResolvedValueOnce(post);
    await expect(
      service.resolvePost(scope, 'channel', '789')
    ).rejects.toThrow();
  });
  it('bloqueia ativacao com alias de video sem consumir budget de lookup', async () => {
    read
      .mockResolvedValueOnce(videoPost('123_789'))
      .mockResolvedValueOnce({ id: '789', from: { id: '123' }, post_id: '456' })
      .mockResolvedValueOnce(videoPost('123_456'));
    await expect(
      service.assertPost(scope, 'channel', '123_789')
    ).rejects.toThrow('POST_REFERENCE_NOT_CANONICAL');
    expect(facebook.authorizedPostLookup).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it('aceita Page Post canonico na ativacao sem consumir budget de lookup', async () => {
    read.mockResolvedValueOnce(videoPost('123_456')).mockResolvedValueOnce({
      id: '789',
      from: { id: '123' },
      post_id: '456',
    });
    await expect(
      service.assertPost(scope, 'channel', '123_456')
    ).resolves.toBeUndefined();
    expect(facebook.authorizedPostLookup).not.toHaveBeenCalled();
  });
  it('rejeita outro perfil, Instagram e outra Pagina antes da consulta Graph', async () => {
    repo.integration.mockRejectedValueOnce(new Error('CHANNEL_NOT_FOUND'));
    await expect(
      service.resolvePost({ ...scope, profileId: 'other' }, 'channel', '456')
    ).rejects.toThrow('CHANNEL_NOT_FOUND');
    repo.integration.mockResolvedValueOnce({
      providerIdentifier: 'instagram',
      internalId: '123',
    });
    await expect(service.resolvePost(scope, 'channel', '456')).rejects.toThrow(
      'POST_LOOKUP_FACEBOOK_ONLY'
    );
    await expect(
      service.resolvePost(scope, 'channel', '789_456')
    ).rejects.toThrow('POST_CHANNEL_MISMATCH');
    expect(read).not.toHaveBeenCalled();
    expect(facebook.authorizedPostLookup).not.toHaveBeenCalled();
    expect(resolveIgRoute).not.toHaveBeenCalled();
  });
  it.each([
    { id: '123_456', from: { id: '789' } },
    { id: '123_999', from: { id: '123' } },
    {
      id: '789',
      from: { id: '123' },
      permalink_url: 'https://www.facebook.com/reel/789/',
    },
    { id: '123_456' },
  ])(
    'nao devolve metadados sem propriedade e ID confirmados: %j',
    async (post) => {
      read.mockResolvedValue({ ...post, message: 'private caption' });
      await expect(
        service.resolvePost(
          scope,
          'channel',
          'https://www.facebook.com/789/posts/456'
        )
      ).rejects.toThrow('POST_CHANNEL_MISMATCH');
    }
  );
  it('recusa autorizacao de outra Pagina antes de consultar', async () => {
    facebook.authorizedPostLookup.mockResolvedValue({
      pageId: '789',
      pageToken: 'fixture',
    });
    await expect(service.resolvePost(scope, 'channel', '456')).rejects.toThrow(
      'POST_CHANNEL_MISMATCH'
    );
    expect(read).not.toHaveBeenCalled();
  });
  it('nao consulta Meta quando o orcamento da Pagina foi esgotado', async () => {
    facebook.authorizedPostLookup.mockRejectedValue(
      new Error('POST_LOOKUP_RATE_LIMITED')
    );
    await expect(service.resolvePost(scope, 'channel', '456')).rejects.toThrow(
      'POST_LOOKUP_RATE_LIMITED'
    );
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    ['PERMISSION_DENIED', 'POST_LOOKUP_ACCESS_REQUIRED'],
    ['TOKEN_INVALID', 'POST_LOOKUP_ACCESS_REQUIRED'],
    ['META_REJECTED', 'POST_LOOKUP_UNAVAILABLE'],
    ['RATE_LIMITED', 'POST_LOOKUP_RETRY'],
    ['OUTCOME_UNKNOWN', 'POST_LOOKUP_RETRY'],
  ])('converte falha %s em feedback controlado %s', async (category, code) => {
    read.mockRejectedValue(new MetaAutomationError(category as any, 100));
    await expect(service.resolvePost(scope, 'channel', '456')).rejects.toThrow(
      code
    );
  });
  it('consulta is_published da publicacao canonica para a badge sem inferir anuncio', async () => {
    read.mockResolvedValue({
      id: '123_456',
      from: { id: '123' },
      is_published: false,
    });
    expect(await service.resolvePost(scope, 'channel', '456')).toMatchObject({
      post: { id: '123_456', isPublished: false },
    });
    expect(read).toHaveBeenCalledWith(
      '123_456',
      'fixture',
      expect.objectContaining({
        fields: expect.stringContaining('is_published'),
      })
    );
    expect(write).not.toHaveBeenCalled();
  });
  it('limita metadados e nao retorna URLs inseguras', async () => {
    read.mockResolvedValue({
      id: '123_456',
      from: { id: '123' },
      message: 'x'.repeat(50000),
      permalink_url: 'javascript:alert(1)',
      full_picture: 'https://evil.test/tracker',
      created_time: 'not-a-date',
    });
    const { post } = await service.resolvePost(scope, 'channel', '456');
    expect(post.caption.length).toBeLessThanOrEqual(5000);
    expect(post.permalink).toBeUndefined();
    expect(post.thumbnailUrl).toBeUndefined();
    expect(post.timestamp).toBeUndefined();
  });
  it('envia Messenger para PSID com RESPONSE sem consultar comentario', async () => {
    const dm = {
      ...event,
      eventType: 'messenger_message' as const,
      externalEventId: 'm_opaque',
      externalPostId: '',
    };
    const response = {
      ...action,
      key: 'messenger_reply',
      kind: 'messenger_reply' as const,
    };
    const send = await service.prepare(scope, 'channel', dm, response);
    expect(read).not.toHaveBeenCalled();
    expect(facebook.inspectAccount).not.toHaveBeenCalled();
    await send();
    expect(write).toHaveBeenCalledWith(
      '123/messages',
      'fixture',
      {
        recipient: { id: '999' },
        messaging_type: 'RESPONSE',
        message: { text: action.text },
      },
      'message_id'
    );
  });
  it('recusa Messenger fora da janela e reavalia a janela imediatamente antes de enviar', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const dm = {
      ...event,
      eventType: 'messenger_message' as const,
      externalEventId: 'm_opaque',
      externalPostId: '',
      occurredAt: now - 86400000 + 1000,
    };
    const response = {
      ...action,
      key: 'messenger_reply',
      kind: 'messenger_reply' as const,
    };
    const send = await service.prepare(scope, 'channel', dm, response);
    (Date.now as jest.Mock).mockReturnValue(now + 1001);
    await expect(send()).rejects.toThrow('MESSENGER_WINDOW_EXPIRED');
    await expect(
      service.prepare(scope, 'channel', dm, response)
    ).rejects.toThrow('MESSENGER_WINDOW_EXPIRED');
    expect(write).not.toHaveBeenCalled();
  });
  it('le readiness Messenger sem feed e ativa apenas quando solicitado', async () => {
    await service.readiness(scope, 'channel', 'messenger_message');
    expect(facebook.inspectMessengerAccount).toHaveBeenCalledWith(
      scope,
      'channel'
    );
    expect(facebook.inspectAccount).not.toHaveBeenCalled();
    await service.activateMessenger(scope, 'channel');
    expect(facebook.inspectMessengerAccount).toHaveBeenCalledWith(
      scope,
      'channel',
      true
    );
  });
  it('revalida autorizacao antes do unico POST e bloqueia troca de token', async () => {
    const send = await service.prepare(scope, 'channel', event, action);
    expect(write).not.toHaveBeenCalled();
    facebook.authorizedAccount.mockResolvedValue({
      pageId: '123',
      pageToken: 'changed',
    });
    await expect(send()).rejects.toThrow('AUTHORIZATION_CHANGED');
    expect(write).not.toHaveBeenCalled();
  });
  it('bloqueia outro canal e comentario ja consumido', async () => {
    process.env.SHARED_AUTOMATION_TEST_INTEGRATION = 'target';
    await expect(
      service.prepare(scope, 'channel', event, action)
    ).rejects.toThrow('LOCAL_TEST_CHANNEL_ONLY');
    expect(repo.integration).not.toHaveBeenCalled();
    delete process.env.SHARED_AUTOMATION_TEST_INTEGRATION;
    read.mockResolvedValue({
      id: event.externalEventId,
      created_time: new Date(event.occurredAt).toISOString(),
      can_reply_privately: false,
    });
    await expect(
      service.prepare(scope, 'channel', event, action)
    ).rejects.toThrow('PRIVATE_REPLY_UNAVAILABLE');
    expect(write).not.toHaveBeenCalled();
  });
  it('usa rota canonica Instagram e nao abre nova leitura remota apos revalidacao local', async () => {
    repo.integration.mockResolvedValue({
      id: 'channel',
      internalId: '123',
      providerIdentifier: 'instagram-standalone',
      token: 'fixture',
    });
    (resolveIgRoute as jest.Mock).mockResolvedValue({
      host: 'graph.instagram.com',
      token: 'fixture',
      useIgGraph: true,
    });
    read.mockResolvedValue({ id: '123' });
    const send = await service.prepare(
      scope,
      'channel',
      { ...event, platform: 'instagram' },
      action
    );
    expect(read).toHaveBeenCalledTimes(1);
    await send();
    expect(read).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      'me/messages',
      'fixture',
      {
        recipient: { comment_id: event.externalEventId },
        message: { text: action.text },
      },
      'message_id'
    );
    expect(resolveIgRoute).toHaveBeenCalledTimes(1);
  });

  it('bloqueia override removido durante preflight sem renovar token novamente', async () => {
    repo.integration.mockResolvedValue({
      id: 'channel',
      internalId: '123',
      providerIdentifier: 'instagram',
      token: 'page-fixture',
    });
    const messaging = {
      loadState: jest.fn().mockResolvedValue({ instagramTokens: [] }),
    };
    service = new CommentChannelService(
      repo,
      facebook,
      messaging as any,
      {} as any,
      {} as any
    );
    (resolveIgRoute as jest.Mock).mockResolvedValue({
      host: 'graph.instagram.com',
      token: 'override-fixture',
      useIgGraph: true,
      source: 'ig-user-token',
    });
    read.mockResolvedValue({ id: '123' });
    const send = await service.prepare(
      scope,
      'channel',
      { ...event, platform: 'instagram' },
      action
    );
    await expect(send()).rejects.toThrow('AUTHORIZATION_CHANGED');
    expect(write).not.toHaveBeenCalled();
  });
  it('bloqueia conta removida durante preflight', async () => {
    const send = await service.prepare(scope, 'channel', event, action);
    repo.integration.mockRejectedValue(new Error('CHANNEL_NOT_FOUND'));
    await expect(send()).rejects.toThrow('CHANNEL_NOT_FOUND');
    expect(write).not.toHaveBeenCalled();
  });
});
