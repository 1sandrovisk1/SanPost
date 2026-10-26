import 'reflect-metadata';
import { DribbbleProvider } from './dribbble.provider';
import { BadBody, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const postDetails = [
  { id: 'p1', message: 'desc', media: [{ path: 'https://cdn.example/shot.png' }], settings: { title: 'Shot' } },
] as any;

// Lote de providers out/2026 — porte do PR upstream #2134.
describe('DribbbleProvider.post', () => {
  const build = (post: jest.Mock) => {
    const provider = new DribbbleProvider();
    jest.spyOn(provider as any, 'getSsrfSafeAxios').mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: 'stream', status: 200 }),
      post,
    });
    return provider;
  };

  it('4xx do Dribbble vira BadBody com a mensagem da API', async () => {
    const provider = build(
      jest.fn().mockRejectedValue({ response: { status: 422, data: { message: 'Image is invalid' } } })
    );
    const posting = provider.post('u1', 'tok', postDetails);
    await expect(posting).rejects.toBeInstanceOf(BadBody);
    await expect(posting).rejects.toThrow(/Image is invalid/);
  });

  it('401 vira RefreshToken (reconexao), nao BadBody', async () => {
    const provider = build(jest.fn().mockRejectedValue({ response: { status: 401, data: {} } }));
    await expect(provider.post('u1', 'tok', postDetails)).rejects.toBeInstanceOf(RefreshToken);
  });

  it('5xx e 429 continuam propagando (retentaveis)', async () => {
    for (const status of [500, 429]) {
      const provider = build(jest.fn().mockRejectedValue({ response: { status } }));
      let thrown: any;
      try {
        await provider.post('u1', 'tok', postDetails);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).not.toBeInstanceOf(BadBody);
    }
  });
});
