import { createHmac } from 'node:crypto';
import { captureFacebookMessengerJson } from './facebook-messenger-full-capture';
import { validMessengerProbe } from './facebook-messenger-probe';

const now = 1793030400000;
const connection = {
  organizationId: 'org',
  profileId: 'profile',
  integrationId: 'integration',
  appId: '456',
  pageId: '123',
  appSecret: 'SECRET',
  pageToken: 'TOKEN',
};
const probe = {
  organizationId: 'org',
  profileId: 'profile',
  integrationId: 'integration',
  appId: '456',
  pageId: '123',
  issuedAt: now - 1000,
  expiresAt: now + 3600000,
  nonce: 'a'.repeat(32),
  mode: 'full-json' as const,
  testTexts: ['Teste Story MultiPost a1b2c3', 'Teste DM MultiPost a1b2c3'],
};
const event = {
  sender: { id: '987' },
  recipient: { id: '123' },
  timestamp: now,
  unknown_event: { is_story: true, kind: 'STORY' },
  message: {
    mid: 'm_test',
    text: probe.testTexts[0],
    is_story: true,
    novel: ['á', false, null],
  },
};
const body = () => ({
  object: 'page',
  unknown_outer: { enabled: false },
  entry: [{ id: '123', unknown_entry: 'value', messaging: [event] }],
});
function capture(value: unknown = body(), arm: any = probe, secret = 'SECRET') {
  const raw = Buffer.from(JSON.stringify(value, null, 2));
  const signature = `sha256=${createHmac('sha256', secret)
    .update(raw)
    .digest('hex')}`;
  return {
    raw,
    result: captureFacebookMessengerJson(raw, signature, connection, arm, now),
  };
}
describe('captura completa temporaria de JSON Messenger', () => {
  it('preserva bytes e campos desconhecidos em todos os niveis sem inferir Story', () => {
    const { raw, result } = capture();
    expect(result).toMatchObject({ status: 'captured', testIndexes: [0] });
    expect(result?.rawJson).toBe(raw.toString('utf8'));
    expect(JSON.parse(result!.rawJson!)).toEqual(body());
  });
  it('recusa HMAC invalido e armamento errado ausente expirado ou sem limites', () => {
    expect(() => capture(body(), probe, 'WRONG')).toThrow();
    for (const arm of [
      null,
      { ...probe, mode: undefined as string | undefined },
      { ...probe, profileId: 'other' },
      { ...probe, expiresAt: now },
      { ...probe, testTexts: [] },
      { ...probe, testTexts: [probe.testTexts[0], probe.testTexts[0]] },
      { ...probe, expiresAt: now + 7200000 },
    ]) {
      expect(capture(body(), arm).result).toBeNull();
    }
    expect(
      validMessengerProbe({ ...probe, mode: 'unknown' }, connection, now)
    ).toBe(false);
  });
  it('ignora mensagens alheias ao teste e outra pagina', () => {
    expect(
      capture({
        object: 'page',
        entry: [
          {
            id: '123',
            messaging: [{ ...event, message: { text: 'DM privada' } }],
          },
        ],
      }).result
    ).toBeNull();
    expect(
      capture({ object: 'page', entry: [{ id: '999', messaging: [event] }] })
        .result
    ).toBeNull();
  });
  it.each([
    { id: '999', messaging: [event] },
    {
      id: '123',
      messaging: [
        { ...event, message: { mid: 'private', text: 'DM privada' } },
      ],
    },
    { id: '123', changes: [{ value: { message: 'comentario privado' } }] },
    { id: '123', messaging: [{ delivery: { mids: ['secret'] } }] },
    { id: '123', messaging: [] },
  ])('nao armazena corpo de lote misto %j', (extra) => {
    const mixed: any = body();
    mixed.entry.push(extra);
    const result = capture(mixed).result;
    expect(result).toMatchObject({ status: 'skipped', reason: 'MIXED_BATCH' });
    expect(result?.rawJson).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(
      /DM privada|secret|comentario privado/
    );
  });
  it.each(['delivery', 'read', 'postback', 'reaction', 'referral', 'optin'])(
    'rejeita evento de controle %s coexistente',
    (field) => {
      const mixed: any = body();
      mixed.entry[0].messaging[0] = { ...event, [field]: { unknown: true } };
      // Referral can contain origin information: preserve it, unlike status/control events.
      expect(capture(mixed).result?.status).toBe(
        field === 'referral' ? 'captured' : 'skipped'
      );
    }
  );
  it('rejeita eco destinatario estranho standby e payload grande sem truncar', () => {
    for (const value of [
      { ...event, message: { ...event.message, is_echo: true } },
      { ...event, recipient: { id: '999' } },
    ]) {
      const mixed: any = body();
      mixed.entry[0].messaging[0] = value;
      expect(capture(mixed).result?.status).toBe('skipped');
    }
    const mixed: any = body();
    mixed.entry[0].standby = [{ message: { text: 'private' } }];
    expect(capture(mixed).result?.status).toBe('skipped');
    expect(
      capture({ ...body(), large: 'x'.repeat(131072) }).result
    ).toMatchObject({ status: 'skipped', reason: 'TOO_LARGE' });
  });
  it('preserva ambos textos quando a Meta os agrupa em um lote exclusivo', () => {
    const value: any = body();
    value.entry[0].messaging.push({
      ...event,
      message: { ...event.message, mid: 'm_other', text: probe.testTexts[1] },
    });
    expect(capture(value).result).toMatchObject({
      status: 'captured',
      testIndexes: [0, 1],
    });
  });
});
