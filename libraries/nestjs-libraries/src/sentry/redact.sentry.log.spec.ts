import {
  redactDeep,
  redactSentryBreadcrumb,
  redactSentryEvent,
  redactSentryLog,
  redactSentrySpan,
} from './redact.sentry.log';

describe('redacao do que vai ao Sentry', () => {
  it('log: mensagem e atributos, inclusive objetos e Errors logados como parametro', () => {
    const err = Object.assign(new Error('falhou access_token=TOK1'), {});
    const log = redactSentryLog({
      level: 'error',
      message: 'falhou https://api.vk.ru/x?access_token=TOKEN123&v=5 Bearer abc.def.ghi',
      attributes: {
        body: '{"refresh_token":"RT-SEGREDO"}',
        count: 2,
        'sentry.message.parameter.0': {
          response: { data: { client_secret: 'CS-1', nested: { password: 'P-1' } } },
          config: { headers: { Authorization: 'Bearer HDR-1' } },
        },
        'sentry.message.parameter.1': err,
        accessToken: 'NU-1',
        escaped: '{"body":"{\\"refresh_token\\":\\"RT-ESC\\"}"}',
      },
    });

    const all = JSON.stringify(log);
    for (const secret of ['TOKEN123', 'abc.def.ghi', 'RT-SEGREDO', 'CS-1', 'P-1', 'HDR-1', 'TOK1', 'NU-1', 'RT-ESC']) {
      expect(all).not.toContain(secret);
    }
    expect(log.attributes!.count).toBe(2);
    expect(log.level).toBe('error');
  });

  it('mensagem nao textual vira texto redigido; sem atributos segue sem', () => {
    const log = redactSentryLog<{ message?: unknown; attributes?: Record<string, unknown> }>({
      message: { toString: () => 'password=123' },
    });
    expect(log.message).toBe('password=[redacted]');
    expect(log.attributes).toBeUndefined();
  });

  it('breadcrumb e evento de erro tambem saem redigidos', () => {
    const crumb = redactSentryBreadcrumb({ message: 'GET ?token=T-1', data: { url: 'x?secret=S-1' } });
    expect(JSON.stringify(crumb)).not.toMatch(/T-1|S-1/);

    const event = redactSentryEvent({
      message: 'api_key=K-1',
      exception: { values: [{ value: '{"client_secret":"C-1"}' }] },
      extra: { refreshToken: 'R-1' },
      request: { data: { password: 'P-2' } },
    });
    expect(JSON.stringify(event)).not.toMatch(/K-1|C-1|R-1|P-2/);
  });

  it('codigos e contagens numericas ficam; binario, data e mapas viram resumo; limita largura', () => {
    const out = redactDeep({
      code: 'P2025',
      error: { code: 404 },
      usage: { totalTokens: 120 },
      buf: Buffer.from('abc'),
      when: new Date('2026-10-28T10:00:00Z'),
      map: new Map([['a', 1]]),
      many: Array.from({ length: 500 }, (_, i) => i),
    }) as any;
    expect(out.code).toBe('[redacted]');
    expect(out.error.code).toBe(404);
    expect(out.usage.totalTokens).toBe(120);
    expect(out.buf).toBe('[binary 3 bytes]');
    expect(out.when).toBe('2026-10-28T10:00:00.000Z');
    expect(out.map).toBe('[Map 1]');
    expect(out.many).toHaveLength(100);
  });

  it('evento: url, query e headers da requisicao; span: url com token do Graph', () => {
    const event = redactSentryEvent({
      request: {
        url: 'https://app/x?access_token=AT-1',
        query_string: 'code=CD-1',
        headers: { Authorization: 'Bearer HB-1', cookie: 'auth=CK-1', accept: 'json' },
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/AT-1|CD-1|HB-1|CK-1/);
    expect(event.request!.headers!.accept).toBe('json');

    const span = redactSentrySpan({
      description: 'GET https://graph.facebook.com/v25.0/me?access_token=GT-1',
      data: { 'http.url': 'https://graph.facebook.com/x?access_token=GT-2', 'http.status_code': 200 },
    });
    expect(JSON.stringify(span)).not.toMatch(/GT-1|GT-2/);
    expect(span.data!['http.status_code']).toBe(200);
  });

  it('texto gigante e cortado antes da redacao', () => {
    const out = redactDeep('a-'.repeat(60_000) + 'token=T') as string;
    expect(out.length).toBeLessThan(20_100);
  });
});
