import 'reflect-metadata';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'lemmy-spec-secret';

import { LemmyProvider } from './lemmy.provider';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { BadBody, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const integration = {
  id: 'int-1',
  customInstanceDetails: AuthService.fixedEncryption(
    JSON.stringify({ service: 'https://lemmy.example', identifier: 'user', password: 'SECRET-PASS' })
  ),
} as any;

// Lote de providers out/2026 — porte do PR upstream #2128.
describe('LemmyProvider.handleErrors', () => {
  const provider = new LemmyProvider();

  it.each([
    ['{"error":"rate_limit_error"}', 'retry'],
    ['{"error":"not_logged_in"}', 'refresh-token'],
    ['{"error":"incorrect_login"}', 'refresh-token'],
    ['{"error":"site_ban"}', 'bad-body'],
    ['{"error":"banned"}', 'bad-body'],
    ['{"error":"couldnt_find_community"}', 'bad-body'],
    ['{"error":"blocked_url"}', 'bad-body'],
    ['{"error":"deleted"}', 'bad-body'],
    ['{"error":"locked"}', 'bad-body'],
  ])('mapeia %s como %s', (body, type) => {
    expect(provider.handleErrors(body, 400)?.type).toBe(type);
  });

  it('erro desconhecido devolve undefined', () => {
    expect(provider.handleErrors('{"error":"other"}', 400)).toBeUndefined();
  });
});

describe('LemmyProvider.getJwtAndService (login sem vazar a senha)', () => {
  it('falha de login e relancada sem o corpo da requisicao (que tem a senha)', async () => {
    const provider = new LemmyProvider();
    jest.spyOn(provider, 'fetch').mockRejectedValue(
      new BadBody(
        'lemmy',
        '{"error":"incorrect_login"}',
        JSON.stringify({ username_or_email: 'user', password: 'SECRET-PASS' }),
        'Lemmy session is no longer valid, please reconnect the channel'
      )
    );

    let thrown: any;
    try {
      await (provider as any).getJwtAndService(integration);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BadBody);
    expect(JSON.stringify(thrown.details ?? thrown)).not.toMatch(/SECRET-PASS/);
    expect(thrown.message).toMatch(/no longer valid/);
  });

  it('RefreshToken no login tambem sai sem a senha', async () => {
    const provider = new LemmyProvider();
    jest.spyOn(provider, 'fetch').mockRejectedValue(
      new RefreshToken('lemmy', '{"error":"not_logged_in"}', JSON.stringify({ password: 'SECRET-PASS' }), 'x')
    );

    let thrown: any;
    try {
      await (provider as any).getJwtAndService(integration);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(RefreshToken);
    expect(JSON.stringify(thrown.details ?? thrown)).not.toMatch(/SECRET-PASS/);
  });
});

describe('LemmyProvider.post (transporte SSRF-safe com mapeamento de erros)', () => {
  it('login e publicacao passam por this.fetch com o identifier do provider', async () => {
    const provider = new LemmyProvider();
    const fetchSpy = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce({ json: async () => ({ jwt: 'JWT' }) } as any)
      .mockResolvedValueOnce({ json: async () => ({ post_view: { post: { id: 42 } } }) } as any);

    const result = await provider.post(
      'id',
      'tok',
      [
        {
          id: 'p1',
          message: 'hello',
          media: [],
          settings: { subreddit: [{ value: { id: '7', title: 'Comunidade' } }] },
        },
      ] as any,
      integration
    );

    expect(result[0]).toMatchObject({ postId: '42', releaseURL: 'https://lemmy.example/post/42' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][2]).toBe('lemmy');
    expect(fetchSpy.mock.calls[1][2]).toBe('lemmy');
  });
});
