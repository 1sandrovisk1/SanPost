import { describe, expect, it, vi } from 'vitest';
import { persistMediaSettings } from './persist.media.settings';
const values = {
  id: 'media',
  alt: 'alt',
  thumbnail: '/old.jpg',
  thumbnailTimestamp: 0,
  newThumbnail: 'blob:chosen',
};
const response = (ok: boolean, data: unknown) =>
  ({ ok, json: async () => data } as Response);
describe('salvar thumbnail', () => {
  it('envia a imagem capturada e preserva timestamp zero no save', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(
        response(true, { path: 'https://cdn.test/chosen.jpg' })
      )
      .mockResolvedValueOnce(
        response(true, {
          id: 'media',
          name: 'video',
          path: '/video.mp4',
          thumbnail: 'https://cdn.test/chosen.jpg',
          thumbnailTimestamp: 0,
          alt: 'alt',
        })
      );
    const result = await persistMediaSettings(
      api,
      values,
      async () => new Blob(['jpeg'])
    );
    expect(result.thumbnail).toBe('https://cdn.test/chosen.jpg');
    expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({
      thumbnail: 'https://cdn.test/chosen.jpg',
      thumbnailTimestamp: 0,
    });
  });
  it('upload recusado nao tenta salvar metadados', async () => {
    const api = vi.fn().mockResolvedValue(response(false, {}));
    await expect(
      persistMediaSettings(api, values, async () => new Blob(['jpeg']))
    ).rejects.toThrow();
    expect(api).toHaveBeenCalledTimes(1);
  });
  it('recusa de metadados e resposta invalida nunca viram sucesso', async () => {
    for (const result of [
      response(false, {}),
      response(true, { id: 'media', path: '/v.mp4', thumbnail: '/old.jpg' }),
    ]) {
      const api = vi.fn().mockResolvedValue(result);
      await expect(
        persistMediaSettings(api, {
          ...values,
          newThumbnail: null,
          thumbnail: 'https://cdn.test/chosen.jpg',
        })
      ).rejects.toThrow();
    }
  });
});
