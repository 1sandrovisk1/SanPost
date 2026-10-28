import { ApplicationFailure } from '@temporalio/common';
import { redactSecrets, summarizeError } from './error.summary';
import { BadBody, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

// Logs de excecao de provider: o objeto inteiro carrega `details` com o corpo
// da resposta (refresh_token, URLs assinadas), stack e cause. O resumo leva so
// classe, tipo, provider, status/codigo e a mensagem curta.
describe('summarizeError', () => {
  it('BadBody/RefreshToken: classe, tipo e provider, nunca o corpo', () => {
    const bad = new BadBody('tiktok', '{"refresh_token":"SECRET"}', Buffer.from('SECRET-BODY'), '');
    const summary = summarizeError(bad);
    expect(summary).toContain('BadBody');
    expect(summary).toContain('type=bad_body');
    expect(summary).toContain('provider=tiktok');
    expect(summary).not.toMatch(/SECRET/);

    const refresh = new RefreshToken('x', '{"access_token":"SECRET"}', '{}', 'expired');
    expect(summarizeError(refresh)).toMatch(/RefreshToken type=refresh_token provider=x: expired/);
  });

  it('erro http (axios) leva status e codigo; mensagem com token na query e redigida', () => {
    const err = Object.assign(
      new Error('GET https://api.example.com/x?access_token=SECRET&client_secret=S2 failed'),
      { code: 'ERR_BAD_REQUEST', response: { status: 401, data: { token: 'SECRET' } } }
    );
    const summary = summarizeError(err);
    expect(summary).toContain('status=401');
    expect(summary).toContain('code=ERR_BAD_REQUEST');
    expect(summary).toContain('access_token=[redacted]');
    expect(summary).not.toMatch(/SECRET|S2/);
  });

  it.each([
    ['https://graph.example/x?api_key=S1&app_secret=S2&fb_exchange_token=S3', /S1|S2|S3/],
    ['GET https://api.telegram.org/bot123456:AAH-SECRET/getChatMember 400', /AAH-SECRET/],
    ['401 invalid Bearer abc.def-SECRET', /SECRET/],
    ['key sk-proj-ABCDEF1234567890 rejected; tvly-ABCDEFGH1234 rejected', /ABCDEF1234567890|ABCDEFGH1234/],
    ['body {"access_token":"S4","refresh_token": "S5"}', /S4|S5/],
    ['Request cannot be constructed from a URL that includes credentials: https://user:S6@host.example/', /S6/],
    ['Invalid `prisma.integration.update()` invocation: { token: "S7", refreshToken: "S8" }', /S7|S8/],
  ])('redige segredos em %s', (message, secret) => {
    expect(summarizeError(new Error(message))).not.toMatch(secret);
  });

  it('inclui um nivel de cause sem stack', () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: new Error('Blocked IP'),
    });
    const summary = summarizeError(err);
    expect(summary).toBe('TypeError: fetch failed (cause: Error: Blocked IP)');
    expect(summary).not.toContain('    at ');
  });

  it('mensagem longa e truncada e valores nao-objeto viram texto', () => {
    expect(summarizeError(new Error('x'.repeat(1000))).length).toBeLessThan(400);
    expect(summarizeError('boom')).toBe('boom');
    expect(summarizeError(undefined)).toBe('unknown error');
    expect(summarizeError(ApplicationFailure.nonRetryable('m', 'tipo'))).toContain('type=tipo');
  });

  it('redactSecrets fica disponivel para outras superficies (sem cortar o texto)', () => {
    expect(redactSecrets('falha: access_token=SECRET e Bearer abc.def')).toBe(
      'falha: access_token=[redacted] e Bearer [redacted]'
    );
  });
});
