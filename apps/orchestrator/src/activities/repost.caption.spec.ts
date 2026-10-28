import { captionForFormat } from './repost.caption';

// Legenda do repost por destino. TikTok: o Instagram aceita 2.200 caracteres
// (emoji vale 1), o TikTok 2.200 em UTF-16 (emoji vale 2).
describe('captionForFormat', () => {
  it('TIKTOK_FEED corta em 2.200 unidades UTF-16 sem partir emoji', () => {
    expect(captionForFormat('TIKTOK_FEED', 'a'.repeat(2300))).toHaveLength(2200);
    expect(captionForFormat('TIKTOK_FEED', 'a'.repeat(2199) + '😀')).toBe('a'.repeat(2199));
    expect(captionForFormat('TIKTOK_FEED', 'curta')).toBe('curta');
  });

  it('mantem os cortes existentes de X, Threads e Pinterest', () => {
    expect(captionForFormat('X_POST', 'a'.repeat(300))).toHaveLength(250);
    expect(captionForFormat('THREADS_POST', 'a'.repeat(600))).toHaveLength(500);
    expect(captionForFormat('PINTEREST_PIN', 'a'.repeat(600))).toHaveLength(500);
  });

  it('outros destinos e legenda vazia passam intactos', () => {
    expect(captionForFormat('INSTAGRAM_POST' as any, 'a'.repeat(3000))).toHaveLength(3000);
    expect(captionForFormat('TIKTOK_FEED', '')).toBe('');
  });
});
