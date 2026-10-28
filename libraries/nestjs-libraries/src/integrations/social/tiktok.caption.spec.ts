import {
  isTikTokPhotoPost,
  tiktokCaptionTooLong,
  tiktokPlainText,
  tiktokTextLimit,
  truncateTikTokCaption,
} from './tiktok.caption';

// Limites da Content Posting API do TikTok (UTF-16): legenda de video 2.200,
// descricao de foto 4.000, titulo de foto 90.
describe('tiktok.caption', () => {
  it('limite por tipo de post', () => {
    expect(tiktokTextLimit(false)).toBe(2200);
    expect(tiktokTextLimit(true)).toBe(4000);
  });

  it('foto = nenhuma midia mp4; video quando a primeira e mp4', () => {
    expect(isTikTokPhotoPost([{ path: 'https://cdn.example/a.jpg' }])).toBe(true);
    expect(isTikTokPhotoPost([{ path: 'https://cdn.example/a.mp4' }])).toBe(false);
    expect(isTikTokPhotoPost([])).toBe(true);
    expect(isTikTokPhotoPost(undefined)).toBe(true);
    expect(isTikTokPhotoPost([{ path: undefined }])).toBe(true);
  });

  it('conta o texto como o worker entrega ao provider (HTML convertido)', () => {
    expect(tiktokPlainText('<p>Olá <strong>mundo</strong></p>')).toBe('Olá 𝗺𝘂𝗻𝗱𝗼');
    expect(tiktokPlainText('texto puro')).toBe('texto puro');
  });

  it('tiktokCaptionTooLong devolve a mensagem so quando passa do limite', () => {
    expect(tiktokCaptionTooLong('a'.repeat(2200), false)).toBeNull();
    expect(tiktokCaptionTooLong('a'.repeat(2201), false)).toMatch(/2201.*2200|2\.201.*2\.200/);
    expect(tiktokCaptionTooLong('a'.repeat(3000), true)).toBeNull();
    // emoji pesa 2 em UTF-16, como o TikTok conta
    expect(tiktokCaptionTooLong('😀'.repeat(1101), false)).not.toBeNull();
  });

  it('truncateTikTokCaption corta em 2.200 sem partir emoji', () => {
    expect(truncateTikTokCaption('a'.repeat(2300))).toHaveLength(2200);
    const cut = truncateTikTokCaption('a'.repeat(2199) + '😀');
    expect(cut).toBe('a'.repeat(2199));
    expect(truncateTikTokCaption('curto')).toBe('curto');
    expect(truncateTikTokCaption('')).toBe('');
  });
});
