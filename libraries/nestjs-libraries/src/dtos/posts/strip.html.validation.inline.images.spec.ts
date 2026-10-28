import {
  convertImages,
  stripHtmlValidation,
} from '@gitroom/helpers/utils/strip.html.validation';

// Conversao do conteudo com imagem inline (upstream 2aae02fe) pelos modos do
// editor. So o modo html com inlineImages (WordPress, ListMonk) leva <img>;
// os demais seguem recebendo o texto limpo, inclusive o parsing literal de
// <p> que o fork usa (legenda do TikTok, providers, activity).
describe('stripHtmlValidation (imagem inline)', () => {
  const env = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    CLOUDFLARE_BUCKET_URL: process.env.CLOUDFLARE_BUCKET_URL,
    RESTRICT_UPLOAD_DOMAINS: process.env.RESTRICT_UPLOAD_DOMAINS,
  };
  const own = 'https://app.exemplo.com/uploads/2026/10/28/abc.png';
  const content = `<p>Linha 1</p><img src="${own}" alt="capa"><p>Linha 2</p>`;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
    delete process.env.CLOUDFLARE_BUCKET_URL;
    delete process.env.RESTRICT_UPLOAD_DOMAINS;
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

  const html = (value: string, inline: boolean) =>
    stripHtmlValidation('html', value, true, false, false, undefined, inline);

  it('html com inlineImages mantem a imagem no lugar', () => {
    expect(html(content, true)).toBe(
      `<p>Linha 1</p><img src="${own}" alt="capa"><p>Linha 2</p>`
    );
  });

  it('html sem inlineImages tira a imagem (padrao do parametro)', () => {
    expect(html(content, false)).toBe('<p>Linha 1</p><p>Linha 2</p>');
    expect(stripHtmlValidation('html', content, true)).toBe(
      '<p>Linha 1</p><p>Linha 2</p>'
    );
  });

  it('normal (X, TikTok, LinkedIn...) segue texto com uma linha por <p>', () => {
    expect(stripHtmlValidation('normal', content, true)).toBe(
      'Linha 1\nLinha 2'
    );
  });

  it('markdown e none tambem tiram a imagem', () => {
    expect(stripHtmlValidation('markdown', content, true)).not.toContain('img');
    expect(stripHtmlValidation('none', content, true)).toBe('Linha 1Linha 2');
  });

  it('imagem que nao e da instancia nao chega ao provider', () => {
    expect(
      html(
        '<p>a</p><img src="https://rastreio.exemplo.net/p.gif"><img src="data:image/png;base64,AA">',
        true
      )
    ).toBe('<p>a</p>');
  });

  it('alt e src nao fecham o atributo depois da decodificacao de entidades', () => {
    const out = html(
      `<img src="${own}" alt="a&quot; onerror=&quot;alert(1)&amp;quot;">` +
        '<img src="https://app.exemplo.com/uploads/a&amp;quot;/onerror=alert(1)//x.png">',
      true
    );
    expect(out).toBe(`<img src="${own}" alt="a onerror=alert(1)quot;">`);
  });

  it('convertImages e exportado como no upstream', () => {
    expect(convertImages(`<img src="${own}" onload="x()">`)).toBe(
      `<img src="${own}">`
    );
  });
});
