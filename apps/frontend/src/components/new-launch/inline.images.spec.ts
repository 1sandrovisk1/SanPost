import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';

// sanitizePostContent com o DOMPurify de verdade (no Jest ele e um mock
// identidade). E o que roda no DTO do post e no preview publico/paginas de
// revisao (/p/[id]) antes do dangerouslySetInnerHTML.
describe('sanitizePostContent com DOMPurify real (imagem inline)', () => {
  const env = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    CLOUDFLARE_BUCKET_URL: process.env.CLOUDFLARE_BUCKET_URL,
  };
  const own = 'https://app.exemplo.com/uploads/2026/10/28/abc.png';
  const r2 = 'https://midia.exemplo.com/Ab12.webp';

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
    process.env.CLOUDFLARE_BUCKET_URL = 'https://midia.exemplo.com/';
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('mantem imagem do storage local e do bucket', () => {
    expect(
      sanitizePostContent(
        `<p>a</p><img src="${own}" alt="capa"><img src="${r2}">`
      )
    ).toBe(`<p>a</p><img src="${own}" alt="capa"><img src="${r2}">`);
  });

  it.each([
    `<img src="${own}" onerror="alert(1)">`,
    `<img src="${own}" onload=alert(1) style="x">`,
    '<img src=x onerror=alert(1)>',
    '<img src="javascript:alert(1)">',
    '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">',
    '<img src="https://rastreio.exemplo.net/pixel.gif">',
    '<img src="//rastreio.exemplo.net/pixel.gif">',
    '<svg><image href="https://rastreio.exemplo.net/p.png"></image></svg>',
    '<picture><source srcset="https://rastreio.exemplo.net/p.png"></picture>',
    '<math><mi><img src=x onerror=alert(1)></mi></math>',
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  ])('nao deixa evento, esquema perigoso ou origem de fora: %s', (input) => {
    const out = sanitizePostContent(`<p>t</p>${input}`);
    expect(out).not.toMatch(/on(error|load)\s*=/i);
    expect(out).not.toMatch(/javascript:|data:|rastreio\.exemplo\.net/i);
    expect(out).not.toMatch(/<(svg|math|picture|source|noscript|image)\b/i);
    for (const src of out.match(/src="[^"]*"/g) || []) {
      expect(src).toBe(`src="${own}"`);
    }
  });

  it('no navegador (sem ambiente) nenhuma imagem passa', () => {
    expect(sanitizePostContent(`<img src="${own}">`, [])).toBe('');
  });
});
