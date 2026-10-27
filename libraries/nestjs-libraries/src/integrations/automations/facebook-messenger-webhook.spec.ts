import { createHmac } from 'node:crypto';
import { parseFacebookMessengerWebhook } from './facebook-messenger-webhook';
const owner = {
  pageId: '123',
  integrationId: 'integration',
  organizationId: 'org',
  profileId: 'profile',
  appSecret: 'secret',
};
const incoming = {
  sender: { id: '456' },
  recipient: { id: '123' },
  timestamp: Date.now(),
  message: { mid: 'm_opaque:ABC-123', text: 'Quero link' },
};
const parse = (messaging: unknown[], context = owner) => {
  const raw = Buffer.from(
    JSON.stringify({ object: 'page', entry: [{ id: '123', messaging }] })
  );
  return parseFacebookMessengerWebhook(
    raw,
    `sha256=${createHmac('sha256', 'secret').update(raw).digest('hex')}`,
    [context]
  );
};
describe('webhook Messenger por palavra chave', () => {
  it('mantem mid opaco, PSID e escopo sem inventar publicacao', () => {
    expect(parse([incoming])).toEqual([
      {
        ...owner,
        appSecret: undefined,
        pageId: undefined,
        platform: 'facebook',
        eventType: 'messenger_message',
        remoteAccountId: '123',
        externalEventId: incoming.message.mid,
        externalPostId: '',
        externalActorId: '456',
        text: 'Quero link',
        occurredAt: incoming.timestamp,
      },
    ]);
  });
  it('recusa assinatura incorreta e nao roteia outra pagina', () => {
    expect(() => parse([incoming], { ...owner, appSecret: 'wrong' })).toThrow();
    expect(parse([incoming], { ...owner, pageId: '999' })).toEqual([]);
    expect(parse([{ ...incoming, recipient: { id: '999' } }])).toEqual([]);
  });
  it.each([
    { is_echo: true },
    { is_deleted: true },
    { is_unsupported: true },
    { admin_text: 'control' },
    { quick_reply: { payload: 'flow-button' } },
    { text: '' },
    { mid: '' },
    { mid: 'a\nsecret' },
  ])('ignora controles e mensagens invalidas %j', (patch) => {
    expect(
      parse([{ ...incoming, message: { ...incoming.message, ...patch } }])
    ).toEqual([]);
  });
  it('nao transforma ecos, postbacks, recibos ou mensagens antigas em gatilhos', () => {
    expect(
      parse([
        { ...incoming, sender: { id: '123' } },
        { ...incoming, timestamp: Date.now() - 86400001 },
        { ...incoming, timestamp: Date.now() + 120000 },
        { delivery: { mids: ['m'] } },
        { postback: { payload: 'x' } },
      ])
    ).toEqual([]);
  });
});
