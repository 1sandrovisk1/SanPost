import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';

// Porte do upstream #2289 + 2ded21d1: tags de bloco que o editor nao conhece
// viravam texto colado na linha seguinte; agora viram paragrafos, com regex
// linear mesmo para tag sem fechamento.
describe('sanitizePostContent (tags de bloco)', () => {
  it('div/section/article/blockquote/pre/h4-h6 viram paragrafos', () => {
    expect(sanitizePostContent('<div>linha 1</div><div>linha 2</div>')).toBe(
      '<p>linha 1</p><p>linha 2</p>'
    );
    expect(sanitizePostContent('<h4 class="x">titulo</h4><section>corpo</section>')).toBe(
      '<p>titulo</p><p>corpo</p>'
    );
  });

  // A remocao de tags/atributos e do DOMPurify, que no Jest e um mock
  // identidade (jest-mocks/isomorphic-dompurify.js); aqui so a reescrita.
  it('nao mexe em tags que o editor ja conhece nem em texto', () => {
    expect(sanitizePostContent('<p>a</p><ul><li>b</li></ul>')).toBe('<p>a</p><ul><li>b</li></ul>');
    expect(sanitizePostContent('texto <divisao> solto')).toBe('texto <divisao> solto');
  });

  it('tag de bloco sem fechamento nao degrada (regex linear)', () => {
    const hostile = '<div' + ' a'.repeat(50000);
    const started = Date.now();
    sanitizePostContent(hostile);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

// Imagem inline (upstream 2aae02fe). O DOMPurify e identidade no Jest, entao
// estes casos provam a camada do fork que roda depois dele (rewriteInlineImages)
// — a combinacao com o DOMPurify real esta em
// apps/frontend/src/components/new-launch/inline.images.spec.ts (vitest).
describe('sanitizePostContent (imagem inline)', () => {
  const env = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    CLOUDFLARE_BUCKET_URL: process.env.CLOUDFLARE_BUCKET_URL,
  };
  const own = 'https://app.exemplo.com/uploads/2026/10/28/abc.png';

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
    delete process.env.CLOUDFLARE_BUCKET_URL;
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

  it('mantem a imagem da biblioteca com src e alt', () => {
    expect(
      sanitizePostContent(`<p>a</p><img src="${own}" alt="capa"><p>b</p>`)
    ).toBe(`<p>a</p><img src="${own}" alt="capa"><p>b</p>`);
  });

  it.each([
    ['onerror', `<img src="${own}" onerror="alert(1)">`, `<img src="${own}">`],
    ['src sem aspas com evento', '<img src=x onerror=alert(1)>', ''],
    ['javascript:', '<img src="javascript:alert(1)">', ''],
    ['data: svg', '<img src="data:image/svg+xml;base64,PHN2Zz4=">', ''],
    ['pixel de outro host', '<img src="https://rastreio.exemplo.net/p.gif">', ''],
    ['relativo', '<img src="/uploads/a.png">', ''],
    [
      'srcset de fora',
      `<img src="${own}" srcset="https://evil.net/a.png 2x">`,
      `<img src="${own}">`,
    ],
  ])('XSS/rastreio: %s', (_caso, input, expected) => {
    expect(sanitizePostContent(`<p>t</p>${input}`)).toBe(`<p>t</p>${expected}`);
  });

  it('aceita prefixos explicitos (frontend sem ambiente)', () => {
    expect(sanitizePostContent(`<img src="${own}">`, [])).toBe('');
    expect(
      sanitizePostContent('<img src="https://cdn.exemplo.com/a.png">', [
        { origin: 'https://cdn.exemplo.com', pathname: '/' },
      ])
    ).toBe('<img src="https://cdn.exemplo.com/a.png">');
  });
});
