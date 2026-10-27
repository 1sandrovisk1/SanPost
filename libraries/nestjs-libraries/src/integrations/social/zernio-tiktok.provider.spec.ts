jest.mock('@zernio/node', () => {
  const createPost = jest.fn();
  const Zernio = jest.fn().mockImplementation(() => ({ posts: { createPost } }));
  (Zernio as any).createPost = createPost;
  return { __esModule: true, default: Zernio };
});

import Zernio from '@zernio/node';
import { ZernioTikTokProvider } from './zernio-tiktok.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

// TikTok via Zernio: mesmo limite do TikTok (2.200 na legenda de video),
// checado antes de gastar a chamada na Zernio.
describe('ZernioTikTokProvider limite de texto', () => {
  it('legenda de video acima de 2.200 falha com BadBody sem chamar a Zernio', async () => {
    const provider = new ZernioTikTokProvider();
    const usage = jest.spyOn(provider as any, 'checkUsage');

    const error = await provider
      .post(
        'acc-1',
        'zernio-key',
        [{ id: 'p1', message: 'a'.repeat(2201), media: [{ path: 'https://cdn.example/v.mp4' }], settings: {} }] as any,
        {} as any
      )
      .catch((e) => e);

    expect(error).toBeInstanceOf(BadBody);
    expect(error.message).toMatch(/2[.]?201/);
    expect(usage).not.toHaveBeenCalled();
    expect((Zernio as any).createPost).not.toHaveBeenCalled();
  });

  it('foto aceita ate 4.000 e o limite exato de video passa pela checagem', () => {
    const provider = new ZernioTikTokProvider() as any;
    expect(() =>
      provider.assertPublishable([{ message: 'a'.repeat(4000), media: [{ path: 'https://cdn.example/f.jpg' }] }])
    ).not.toThrow();
    expect(() =>
      provider.assertPublishable([{ message: 'a'.repeat(2200), media: [{ path: 'https://cdn.example/v.mp4' }] }])
    ).not.toThrow();
    expect(() =>
      provider.assertPublishable([{ message: 'a'.repeat(4001), media: [{ path: 'https://cdn.example/f.jpg' }] }])
    ).toThrow(BadBody);
  });
});
