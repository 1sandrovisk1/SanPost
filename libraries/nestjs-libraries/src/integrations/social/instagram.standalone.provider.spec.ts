import 'reflect-metadata';
import { InstagramStandaloneProvider } from './instagram.standalone.provider';
import { BadBody, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

describe('InstagramStandaloneProvider Graph API', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('consulta /me pela Graph v25 depois de renovar o token', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'NEW_TOKEN' }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          user_id: 'ig-1',
          name: 'Conta',
          username: 'conta',
          profile_picture_url: 'https://cdn/avatar.jpg',
        }),
      });
    global.fetch = fetchMock as any;

    const result = await new InstagramStandaloneProvider().refreshToken(
      'OLD_TOKEN'
    );

    expect(String(fetchMock.mock.calls[1][0])).toContain(
      'graph.instagram.com/v25.0/me'
    );
    expect(result.accessToken).toBe('NEW_TOKEN');
  });
});

// Checkpoint da Meta no Instagram Login: sem self-heal, o refresh nao resolve.
describe('InstagramStandaloneProvider (checkpoint da Meta)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('handleErrors converte o checkpoint em bad-body com a orientacao, em vez de refresh', () => {
    const provider = new InstagramStandaloneProvider();
    const result = provider.handleErrors(
      'You cannot access the app till you log in to www.facebook.com',
      400
    );
    expect(result).toEqual({
      type: 'bad-body',
      value: expect.stringMatching(/log in at instagram\.com/),
    });
  });

  it('mantem os demais mapeamentos do provider base', () => {
    const provider = new InstagramStandaloneProvider();
    expect(provider.handleErrors('erro 2207052', 400)?.type).toBe('retry');
  });

  it('post() com container em checkpoint falha com BadBody (nao RefreshToken) via delegate', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockImplementation(async (url: any) => {
      const json = String(url).includes('fields=status_code')
        ? {
            status_code: 'ERROR',
            status:
              'Error: You cannot access the app till you log in to www.facebook.com',
          }
        : { id: 'container-1' };
      return {
        status: 200,
        ok: true,
        json: async () => json,
        text: async () => JSON.stringify(json),
        clone() {
          return this;
        },
      };
    }) as any;

    const provider = new InstagramStandaloneProvider();
    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    const assertion = expect(posting).rejects.toBeInstanceOf(BadBody);
    await jest.runAllTimersAsync();
    await assertion;
    await expect(posting).rejects.toThrow(/log in at instagram\.com/);
  });

  it('analytics() com resposta de checkpoint nao lanca RefreshToken (sem recursao de refresh)', async () => {
    const body = JSON.stringify({
      error: {
        message:
          'Error validating access token: You cannot access the app till you log in to www.facebook.com',
        code: 190,
      },
    });
    global.fetch = jest.fn().mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => JSON.parse(body),
      text: async () => body,
      clone() {
        return this;
      },
    }) as any;

    const provider = new InstagramStandaloneProvider();
    let outcome: unknown = 'resolved';
    try {
      await provider.analytics('ig-1', 'token', 7);
    } catch (err) {
      outcome = err;
    }
    expect(outcome).not.toBeInstanceOf(RefreshToken);
  });
});
