import { facebookBackgroundPreset } from './facebook.background';
import { FacebookProvider } from './facebook.provider';
import * as transport from '../../dtos/webhooks/ssrf.safe.dispatcher';
const post = (extra: any = {}) => ({
  id: 'p',
  message: 'Ola',
  media: [],
  settings: { text_format_preset_id: '106018623298955' },
  ...extra,
});
describe('fundo do Facebook', () => {
  afterEach(() => jest.restoreAllMocks());
  it('aplica somente texto curto sem link ou midia', () => {
    expect(facebookBackgroundPreset(post())).toBe('106018623298955');
    for (const p of [
      post({ message: 'x'.repeat(131) }),
      post({ media: [{ path: 'a.jpg' }] }),
      post({ message: 'www.example.com' }),
      post({
        settings: { url: 'https://example.com', text_format_preset_id: '123' },
      }),
      post({ settings: { post_type: 'story', text_format_preset_id: '123' } }),
    ])
      expect(facebookBackgroundPreset(p)).toBeUndefined();
  });
  it('envia preset e repete sem fundo somente apos recusa explicita', async () => {
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 100,
              message: 'Parameter text_format_preset_id: Invalid id',
            },
          }),
          { status: 400 }
        ) as any
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'id', permalink_url: 'https://facebook.com/id' })
        ) as any
      );
    await new FacebookProvider().post('page', 'TOKEN', [post()] as any);
    expect(
      JSON.parse(String(http.mock.calls[0][1]?.body)).text_format_preset_id
    ).toBe('106018623298955');
    expect(
      JSON.parse(String(http.mock.calls[1][1]?.body)).text_format_preset_id
    ).toBeUndefined();
    expect(http).toHaveBeenCalledTimes(2);
  });
  it.each(['500', 'network'])(
    'nao repete publicacao com resultado incerto %s',
    async (mode) => {
      const http = jest.spyOn(transport, 'ssrfSafeFetch');
      if (mode === '500')
        http.mockResolvedValue(
          new Response('{"error":{"code":1}}', { status: 500 }) as any
        );
      else http.mockRejectedValue(new Error('network'));
      await expect(
        new FacebookProvider().post('page', 'TOKEN', [post()] as any)
      ).rejects.toThrow();
      expect(http).toHaveBeenCalledTimes(1);
    }
  );
});
