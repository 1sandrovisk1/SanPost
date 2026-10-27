import { createHmac } from 'node:crypto';
import {
  inspectFacebookMessengerWebhook,
  validMessengerProbe,
} from './facebook-messenger-probe';

const connection = {
  organizationId: 'org',
  profileId: 'profile',
  integrationId: 'integration',
  pageId: '123',
  appId: '456',
  appSecret: 'SECRET',
  pageToken: 'TOKEN',
};
const now = 1793030400000;
const probe = {
  organizationId: 'org',
  profileId: 'profile',
  integrationId: 'integration',
  pageId: '123',
  appId: '456',
  issuedAt: now - 1000,
  expiresAt: now + 3600000,
  nonce: 'a'.repeat(32),
};
const message = {
  sender: { id: '987654' },
  recipient: { id: '123' },
  timestamp: now - 1000,
  message: {
    mid: 'm_private_id',
    text: 'TEXTO_PRIVADO',
    reply_to: { story: { id: '9999', url: 'https://private.invalid/media' } },
    attachments: [
      { type: 'image', payload: { url: 'https://private.invalid/media' } },
    ],
  },
};
function inspect(
  entries: unknown[],
  signature?: string,
  contexts = [connection]
) {
  const raw = Buffer.from(JSON.stringify({ object: 'page', entry: entries }));
  return inspectFacebookMessengerWebhook(
    raw,
    signature ||
      `sha256=${createHmac('sha256', 'SECRET').update(raw).digest('hex')}`,
    contexts,
    now
  );
}

describe('diagnostico temporario do Messenger', () => {
  it('mantem somente campos estruturais sem inferir gatilho Story da fixture sintetica', () => {
    const results = inspect([{ id: '123', messaging: [message] }]);
    expect(results).toHaveLength(1);
    expect(results[0].observation).toMatchObject({
      hasText: true,
      attachmentTypes: ['image'],
      fields: {
        'message.reply_to.story.id': 'string',
        'message.reply_to.story.url': 'string',
      },
    });
    expect(results[0].observation.messageHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(results)).not.toMatch(
      /TEXTO_PRIVADO|987654|private.invalid|m_private_id|9999|SECRET|TOKEN/
    );
    expect(results[0].integrationId).toBe('integration');
  });
  it('preserva somente estrutura de referencia fora de message', () => {
    const result = inspect([
      {
        id: '123',
        messaging: [
          {
            ...message,
            referral: { source: 'PRIVATE_SOURCE', story_id: 'PRIVATE_STORY' },
            reply_to: { id: 'PRIVATE_ID' },
          },
        ],
      },
    ]);
    expect(result[0].observation.fields).toMatchObject({
      'referral.source': 'string',
      'referral.story_id': 'string',
      'reply_to.id': 'string',
    });
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE_SOURCE|PRIVATE_STORY|PRIVATE_ID/
    );
  });
  it('recusa assinatura invalida e nao reutiliza segredo para outra pagina ou perfil', () => {
    expect(() =>
      inspect([{ id: '123', messaging: [message] }], `sha256=${'0'.repeat(64)}`)
    ).toThrow();
    expect(inspect([{ id: '999', messaging: [message] }])).toEqual([]);
    const results = inspect([{ id: '123', messaging: [message] }], undefined, [
      connection,
      {
        ...connection,
        integrationId: 'other',
        profileId: 'other',
        appSecret: 'OTHER',
      },
    ]);
    expect(results.map((x) => x.integrationId)).toEqual(['integration']);
  });
  it('observa eco sem tratar como entrada e ignora recibos sem message', () => {
    const results = inspect([
      {
        id: '123',
        messaging: [
          {
            ...message,
            sender: { id: '123' },
            recipient: { id: '987654' },
            message: { mid: 'm_echo', is_echo: true },
          },
          {
            sender: { id: '987654' },
            recipient: { id: '123' },
            delivery: { mids: ['private'] },
          },
        ],
      },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].observation.isEcho).toBe(true);
  });
  it('recusa destinatario divergente e limita quota e estrutura sem nomes arbitrarios', () => {
    expect(
      inspect([
        { id: '123', messaging: [{ ...message, recipient: { id: '999' } }] },
      ])
    ).toEqual([]);
    const noisy = {
      ...message,
      message: {
        ...message.message,
        confidential_person_name: 'SECRET',
        attachments: Array.from({ length: 100 }, () => ({
          type: 'private type',
          payload: { text: 'PRIVATE' },
        })),
      },
    };
    const results = inspect([
      { id: '123', messaging: Array.from({ length: 100 }, () => noisy) },
    ]);
    expect(results.length).toBeLessThanOrEqual(20);
    expect(results[0].observation.unknownFieldCount).toBeGreaterThan(0);
    expect(JSON.stringify(results)).not.toMatch(
      /confidential_person_name|private type|PRIVATE/
    );
    expect(JSON.stringify(results[0].observation).length).toBeLessThan(10000);
  });
  it('armamento ausente invalido expirado ou de outro escopo nao habilita diagnostico', () => {
    expect(validMessengerProbe(probe, connection, now)).toBe(true);
    for (const bad of [
      null,
      {},
      { ...probe, expiresAt: now },
      { ...probe, issuedAt: now + 1 },
      { ...probe, expiresAt: probe.issuedAt + 86400001 },
      ...[
        'organizationId',
        'profileId',
        'integrationId',
        'pageId',
        'appId',
      ].map((key) => ({ ...probe, [key]: 'other' })),
    ]) {
      expect(validMessengerProbe(bad, connection, now)).toBe(false);
    }
  });
});
