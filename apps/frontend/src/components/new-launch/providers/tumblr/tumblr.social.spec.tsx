import { describe, it, expect, vi } from 'vitest';
vi.mock('../high.order.provider', () => ({
  PostComment: { POST: 1 },
  withProvider: (configuration: unknown) => configuration,
}));
import provider from './tumblr.provider';
describe('contrato do compositor Tumblr', () => {
  const validate = (provider as any).checkValidity;
  it('recusa blocos extras em vez de descartar texto do post', async () => {
    expect(
      await validate(
        [[], []],
        {},
        undefined,
        (_: string, fallback: string) => fallback
      )
    ).toContain('one post');
  });
  it('permite um post com 30 imagens e um video', async () => {
    const images = Array.from({ length: 30 }, () => ({ path: 'image.png' }));
    expect(await validate([[...images, { path: 'video.MP4?x=1' }]], {})).toBe(
      true
    );
  });
});
