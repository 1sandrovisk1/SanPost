import 'reflect-metadata';
import { TumblrProvider } from './tumblr.provider';
import * as transport from '../../dtos/webhooks/ssrf.safe.dispatcher';
const json = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status });
describe('TumblrProvider', () => {
  afterEach(() => jest.restoreAllMocks());
  it('OAuth usa app do perfil e state seguro', async () => {
    const p = new TumblrProvider();
    const auth = await p.generateAuthUrl({
      client_id: 'profile-app',
      client_secret: 'secret',
      instanceUrl: '',
    });
    const url = new URL(auth.url);
    expect(url.searchParams.get('client_id')).toBe('profile-app');
    expect(auth.state.length).toBeGreaterThanOrEqual(32);
    expect(url.searchParams.get('scope')).toContain('write');
  });
  it('refresh usa segredo do perfil e conserva refresh anterior se nao rotacionar', async () => {
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockResolvedValueOnce(json({ access_token: 'new', expires_in: 3600 }))
      .mockResolvedValueOnce(
        json({ response: { user: { name: 'owner', blogs: [] } } })
      );
    const result = await new TumblrProvider().refreshToken('old', {
      client_id: 'profile',
      client_secret: 'secret',
      instanceUrl: '',
    });
    expect(result.refreshToken).toBe('old');
    const body = new URLSearchParams(String(http.mock.calls[0][1]?.body));
    expect(body.get('client_id')).toBe('profile');
    expect(body.get('refresh_token')).toBe('old');
  });
  it('selecao recusa blog que nao pertence ao token', async () => {
    jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockResolvedValue(
        json({ response: { user: { blogs: [{ name: 'owned' }] } } })
      );
    await expect(
      new TumblrProvider().fetchPageInformation('TOKEN', { id: 'other' })
    ).rejects.toThrow();
  });
  it('confirma ID string longo sem arredondar e envia texto em NPF', async () => {
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockResolvedValue(json({ response: { id: '9007199254740993123' } }));
    const result = await new TumblrProvider().post(
      'owned',
      'TOKEN',
      [
        { id: 'p', message: 'Ola', settings: { tags: 'a,b' }, media: [] },
      ] as any,
      {} as any
    );
    expect(result[0].postId).toBe('9007199254740993123');
    expect(JSON.parse(String(http.mock.calls[0][1]?.body)).content[0]).toEqual({
      type: 'text',
      text: 'Ola',
    });
  });
  it.each(['id ausente', '500', 'rede'])(
    'nao publica de novo em %s',
    async (kind) => {
      const http = jest.spyOn(transport, 'ssrfSafeFetch');
      if (kind === 'rede') http.mockRejectedValue(new Error('network'));
      else
        http.mockResolvedValue(
          json(
            kind === '500' ? { error: 'fail' } : { response: {} },
            kind === '500' ? 500 : 200
          )
        );
      await expect(
        new TumblrProvider().post(
          'owned',
          'TOKEN',
          [{ id: 'p', message: 'Ola', settings: {}, media: [] }] as any,
          {} as any
        )
      ).rejects.toThrow();
      expect(http).toHaveBeenCalledTimes(1);
    }
  );
});
