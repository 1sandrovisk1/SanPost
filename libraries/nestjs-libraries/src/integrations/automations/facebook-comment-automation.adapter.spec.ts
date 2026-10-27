import { createMock } from '@gitroom/nestjs-libraries/test';
import {
  FacebookCommentAutomationAdapter,
  FacebookAutomationConnection,
} from './facebook-comment-automation.adapter';
import { MetaAutomationGraphClient } from './meta-automation-graph.client';

const connection: FacebookAutomationConnection = {
  pageId: '123',
  appId: '456',
  pageAccessToken: 'PAGE_SECRET',
  appAccessToken: 'APP_SECRET',
};
const now = Date.parse('2026-10-19T12:00:00Z');
const message = {
  commentId: '123_789',
  occurredAt: now - 1000,
  text: 'Seu link: https://example.com/material',
};

describe('FacebookCommentAutomationAdapter', () => {
  let client: ReturnType<typeof createMock<MetaAutomationGraphClient>>;
  let adapter: FacebookCommentAutomationAdapter;
  beforeEach(() => {
    client = createMock<MetaAutomationGraphClient>();
    adapter = new FacebookCommentAutomationAdapter(client);
  });

  function readyResponses(overrides: Record<string, unknown> = {}) {
    client.read.mockImplementation(async (path: string) => {
      if (path === 'debug_token')
        return {
          data: {
            is_valid: true,
            app_id: '456',
            type: 'PAGE',
            profile_id: '123',
            expires_at: 0,
            data_access_expires_at: 0,
            scopes: [
              'pages_messaging',
              'pages_manage_metadata',
              'pages_read_engagement',
              'pages_read_user_content',
              'pages_manage_engagement',
            ],
            ...overrides,
          },
        };
      if (path === 'me') return { id: '123' };
      if (path === '123/subscribed_apps')
        return { data: [{ id: '456', subscribed_fields: ['feed'] }] };
      if (path === '123/published_posts')
        return {
          data: [{ id: '123_10', created_time: '2026-10-19T11:00:00Z' }],
        };
      throw new Error('unexpected request');
    });
  }

  it('verifica identidade, app, permissoes, assinatura e leitura sem declarar prova real', async () => {
    readyResponses();
    const result = await adapter.inspect(connection, now);
    expect(result.status).toBe('PREFLIGHT_PASSED');
    expect(result.liveProofRequired).toBe(true);
    expect(result.posts).toEqual([
      { id: '123_10', createdTime: '2026-10-19T11:00:00Z' },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/PAGE_SECRET|APP_SECRET/);
    expect(client.write).not.toHaveBeenCalled();
  });

  it.each([
    [{ is_valid: false }, 'TOKEN_INVALID'],
    [{ app_id: '999' }, 'APP_MISMATCH'],
    [{ type: 'USER' }, 'PAGE_TOKEN_REQUIRED'],
    [{ profile_id: '999' }, 'PAGE_MISMATCH'],
    [{ expires_at: now / 1000 - 1 }, 'TOKEN_EXPIRED'],
    [{ data_access_expires_at: now / 1000 - 1 }, 'DATA_ACCESS_EXPIRED'],
    [{ scopes: ['pages_manage_posts'] }, 'PERMISSIONS_MISSING'],
    [
      { granular_scopes: [{ scope: 'pages_messaging', target_ids: ['999'] }] },
      'PAGE_PERMISSION_MISSING',
    ],
  ])(
    'bloqueia preflight quando o token nao atende ao contrato: %j',
    async (override, code) => {
      readyResponses(override);
      const result = await adapter.inspect(connection, now);
      expect(result.status).toBe('BLOCKED');
      expect(result.reasons).toContain(code);
      expect(client.write).not.toHaveBeenCalled();
    }
  );

  it('nao considera assinatura de outro app como valida', async () => {
    readyResponses();
    const original = client.read.getMockImplementation();
    client.read.mockImplementation(async (...args) =>
      args[0] === '123/subscribed_apps'
        ? { data: [{ id: '999', subscribed_fields: ['feed'] }] }
        : original(...args)
    );
    expect((await adapter.inspect(connection, now)).reasons).toContain(
      'FEED_SUBSCRIPTION_MISSING'
    );
  });

  it('falha fechada quando a listagem de assinaturas esta paginada', async () => {
    readyResponses();
    const original = client.read.getMockImplementation();
    client.read.mockImplementation(async (...args) =>
      args[0] === '123/subscribed_apps'
        ? {
            data: [],
            paging: { next: 'https://untrusted.example?access_token=SECRET' },
          }
        : original(...args)
    );
    const result = await adapter.inspect(connection, now);
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons).toContain('SUBSCRIPTIONS_INCOMPLETE');
    expect(client.read).toHaveBeenCalledTimes(4);
  });

  it('envia o link na primeira mensagem com token da Page e recipient.comment_id', async () => {
    client.write.mockResolvedValue({ status: 'SENT', remoteId: 'mid.1' });
    expect(await adapter.sendPrivateReply(connection, message, now)).toEqual({
      status: 'SENT',
      remoteId: 'mid.1',
    });
    expect(client.write).toHaveBeenCalledWith(
      '123/messages',
      'PAGE_SECRET',
      {
        recipient: { comment_id: '123_789' },
        message: { text: message.text },
      },
      'message_id'
    );
  });

  it('monta botao URL sem postback ou segunda DM', async () => {
    await adapter.sendPrivateReply(
      connection,
      { ...message, button: { title: 'Abrir', url: 'https://example.com' } },
      now
    );
    expect(client.write).toHaveBeenCalledWith(
      '123/messages',
      'PAGE_SECRET',
      {
        recipient: { comment_id: '123_789' },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: message.text,
              buttons: [
                { type: 'web_url', title: 'Abrir', url: 'https://example.com' },
              ],
            },
          },
        },
      },
      'message_id'
    );
    expect(client.write).toHaveBeenCalledTimes(1);
  });

  it.each([
    { occurredAt: now - 7 * 86400000 },
    { occurredAt: now + 1 },
    { occurredAt: NaN },
    { commentId: '../../messages' },
    { text: '' },
    { text: 'x'.repeat(2001) },
    {
      text: 'x'.repeat(641),
      button: { title: 'Abrir', url: 'https://example.com' },
    },
    { button: { title: 'x'.repeat(21), url: 'https://example.com' } },
    { button: { title: 'Abrir', url: 'javascript:alert(1)' } },
    { button: { title: 'Abrir', url: 'https://user:password@example.com' } },
  ])('rejeita envio invalido antes do HTTP: %j', async (override) => {
    await expect(
      adapter.sendPrivateReply(connection, { ...message, ...override }, now)
    ).rejects.toThrow();
    expect(client.write).not.toHaveBeenCalled();
  });

  it('permite outro comentario da mesma pessoa sem cooldown inventado', async () => {
    await adapter.sendPrivateReply(connection, message, now);
    await adapter.sendPrivateReply(
      connection,
      { ...message, commentId: '123_790' },
      now
    );
    expect(client.write).toHaveBeenCalledTimes(2);
  });

  it('resposta publica usa o comentario correto e nao retry do provider de publicacao', async () => {
    await adapter.replyPublicly(connection, {
      commentId: '123_789',
      text: 'Veja sua mensagem',
    });
    expect(client.write).toHaveBeenCalledWith(
      '123_789/comments',
      'PAGE_SECRET',
      { message: 'Veja sua mensagem' },
      'id'
    );
  });
});
