import { createHmac } from 'node:crypto';
import { parseFacebookCommentWebhook } from './facebook-automation-webhook';

// Fixture sintetica de contrato. Nao representa captura homologada da Meta.
const entry = (pageId = '123', value: Record<string, unknown> = {}) => ({
  id: pageId,
  time: 1792411200,
  changes: [
    {
      field: 'feed',
      value: {
        item: 'comment',
        verb: 'add',
        post_id: `${pageId}_10`,
        comment_id: '10_20',
        parent_id: `${pageId}_10`,
        from: { id: '99', name: 'Nao persistir' },
        message: 'Quero o link',
        created_time: 1792411100,
        ...value,
      },
    },
  ],
});
const secret = 'app-secret';
const contexts = [
  {
    pageId: '123',
    integrationId: 'int-1',
    organizationId: 'org-1',
    profileId: 'profile-1',
    appSecret: secret,
  },
];
function invoke(entries = [entry()], signatureOverride?: string) {
  const raw = Buffer.from(JSON.stringify({ object: 'page', entry: entries }));
  const signature =
    signatureOverride ??
    `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  return parseFacebookCommentWebhook(raw, signature, contexts);
}

describe('parseFacebookCommentWebhook', () => {
  it('ignora mensagens assinadas sem changes e preserva comentarios de lote misto', () => {
    const messaging = {
      id: '123',
      messaging: [{ message: { mid: 'm_test', text: 'DM' } }],
    };
    expect(invoke([messaging] as any).events).toEqual([]);
    expect(invoke([messaging, entry()] as any).events).toHaveLength(1);
    expect(
      invoke([{ ...entry(), messaging: messaging.messaging }] as any).events
    ).toHaveLength(1);
  });

  it.each([null, {}, 'invalid', Array.from({ length: 101 }, () => ({}))])(
    'nao aceita messaging invalida no lugar de changes: %j',
    (messaging) => {
      expect(() => invoke([{ id: '123', messaging }] as any)).toThrow();
    }
  );

  it('messaging nao mascara changes presente e invalido', () => {
    expect(() =>
      invoke([{ id: '123', messaging: [], changes: null }] as any)
    ).toThrow();
  });

  it('normaliza somente o body assinado e o tenant da Page verificada', () => {
    const result = invoke();
    expect(result.events).toEqual([
      {
        platform: 'facebook',
        eventType: 'comment_on_post',
        pageId: '123',
        integrationId: 'int-1',
        organizationId: 'org-1',
        profileId: 'profile-1',
        externalEventId: '10_20',
        externalPostId: '123_10',
        externalActorId: '99',
        text: 'Quero o link',
        occurredAt: 1792411100000,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/app-secret|Nao persistir/);
  });

  it.each(['', 'sha1=abc', 'sha256=0', `sha256=${'0'.repeat(64)}`])(
    'recusa assinatura invalida %s',
    (signature) => {
      expect(() => invoke([entry()], signature)).toThrow();
    }
  );

  it('assinar outro body nao autentica o evento', () => {
    const signature = `sha256=${createHmac('sha256', secret)
      .update('{}')
      .digest('hex')}`;
    expect(() => invoke([entry()], signature)).toThrow();
  });

  it.each([
    { verb: 'edited' },
    { verb: 'remove' },
    { item: 'like' },
    { from: { id: '123' } },
    { parent_id: '10_19' },
  ])('ignora evento inelegivel %j', (value) => {
    expect(invoke([entry('123', value)]).events).toEqual([]);
  });

  it.each([
    { post_id: '999_10' },
    { post_id: '10' },
    { created_time: undefined },
    { comment_id: '../20' },
    { from: {} },
  ])('recusa normalizacao ambigua %j', (value) => {
    const result = invoke([entry('123', value)]);
    expect(result.events).toEqual([]);
    expect(result.ignoredCount).toBe(1);
  });

  it('nao usa segredo de outra Page ou perfil em lote misto', () => {
    const raw = Buffer.from(
      JSON.stringify({ object: 'page', entry: [entry(), entry('456')] })
    );
    const sig = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;
    const result = parseFacebookCommentWebhook(raw, sig, [
      ...contexts,
      {
        pageId: '456',
        integrationId: 'int-2',
        organizationId: 'org-2',
        profileId: 'profile-2',
        appSecret: 'other-secret',
      },
    ]);
    expect(result.events.map((e) => e.integrationId)).toEqual(['int-1']);
    expect(result.rejectedEntryCount).toBe(1);
  });

  it('valida cada contexto mesmo quando duas integracoes compartilham Page', () => {
    const raw = Buffer.from(
      JSON.stringify({ object: 'page', entry: [entry()] })
    );
    const sig = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;
    const result = parseFacebookCommentWebhook(raw, sig, [
      ...contexts,
      { ...contexts[0], integrationId: 'int-other', appSecret: 'other-secret' },
    ]);
    expect(result.events.map((e) => e.integrationId)).toEqual(['int-1']);
  });

  it('roteia duas Pages do mesmo app para os respectivos vinculos sem cruzar perfis', () => {
    const raw = Buffer.from(
      JSON.stringify({
        object: 'page',
        profileId: 'untrusted',
        entry: [entry(), entry('456'), entry('789')],
      })
    );
    const signature = `sha256=${createHmac('sha256', secret)
      .update(raw)
      .digest('hex')}`;
    const other = {
      pageId: '456',
      integrationId: 'int-2',
      organizationId: 'org-2',
      profileId: 'profile-2',
      appSecret: secret,
    };
    const result = parseFacebookCommentWebhook(raw, signature, [
      ...contexts,
      other,
    ]);
    expect(
      result.events.map(
        ({
          pageId,
          integrationId,
          organizationId,
          profileId,
          externalPostId,
        }) => ({
          pageId,
          integrationId,
          organizationId,
          profileId,
          externalPostId,
        })
      )
    ).toEqual([
      {
        pageId: '123',
        integrationId: 'int-1',
        organizationId: 'org-1',
        profileId: 'profile-1',
        externalPostId: '123_10',
      },
      {
        pageId: '456',
        integrationId: 'int-2',
        organizationId: 'org-2',
        profileId: 'profile-2',
        externalPostId: '456_10',
      },
    ]);
    expect(result.rejectedEntryCount).toBe(1);
    expect(result.ignoredCount).toBe(0);
  });

  it('limita fan-out e tamanho antes de processar payload', () => {
    expect(() => invoke(Array.from({ length: 101 }, () => entry()))).toThrow();
    expect(() =>
      parseFacebookCommentWebhook(Buffer.alloc(1024 * 1024 + 1), '', contexts)
    ).toThrow();
  });
});
