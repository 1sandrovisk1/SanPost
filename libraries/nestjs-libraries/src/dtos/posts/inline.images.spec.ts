import {
  isOwnMediaUrl,
  normalizeOwnMediaUrl,
  ownMediaPrefixes,
  rewriteInlineImages,
} from '@gitroom/helpers/utils/inline.images';

// Imagem inline no conteudo (upstream 2aae02fe), com a regra do fork: so a
// midia da propria instancia (storage local em FRONTEND_URL/uploads ou bucket
// R2), nunca qualquer http(s) como no upstream.
describe('inline.images', () => {
  const prefixes = ownMediaPrefixes({
    frontendUrl: 'https://app.exemplo.com',
    cloudflareUrl: 'https://midia.exemplo.com/',
  });
  const own = 'https://app.exemplo.com/uploads/2026/10/28/abc123.png';
  const r2 = 'https://midia.exemplo.com/Ab12Cd.webp';

  describe('ownMediaPrefixes', () => {
    it('monta os prefixos do storage local e do bucket R2', () => {
      expect(prefixes).toEqual([
        { origin: 'https://app.exemplo.com', pathname: '/uploads/' },
        { origin: 'https://midia.exemplo.com', pathname: '/' },
      ]);
    });

    it('ignora valores vazios, invalidos ou sem http(s)', () => {
      expect(
        ownMediaPrefixes({ frontendUrl: '', cloudflareUrl: 'nao e url' })
      ).toEqual([]);
      expect(ownMediaPrefixes({ frontendUrl: 'ftp://app.exemplo.com' })).toEqual(
        []
      );
    });

    it('le FRONTEND_URL e CLOUDFLARE_BUCKET_URL do ambiente por padrao', () => {
      const frontend = process.env.FRONTEND_URL;
      const bucket = process.env.CLOUDFLARE_BUCKET_URL;
      process.env.FRONTEND_URL = 'http://localhost:4200/';
      delete process.env.CLOUDFLARE_BUCKET_URL;
      try {
        expect(ownMediaPrefixes()).toEqual([
          { origin: 'http://localhost:4200', pathname: '/uploads/' },
        ]);
      } finally {
        process.env.FRONTEND_URL = frontend;
        if (bucket === undefined) {
          delete process.env.CLOUDFLARE_BUCKET_URL;
        } else {
          process.env.CLOUDFLARE_BUCKET_URL = bucket;
        }
      }
    });
  });

  describe('normalizeOwnMediaUrl', () => {
    it('aceita a midia local e a do bucket', () => {
      expect(normalizeOwnMediaUrl(own, prefixes)).toBe(own);
      expect(normalizeOwnMediaUrl(r2, prefixes)).toBe(r2);
      expect(isOwnMediaUrl(own, prefixes)).toBe(true);
    });

    it('descarta query e fragmento', () => {
      expect(normalizeOwnMediaUrl(`${own}?v=2#topo`, prefixes)).toBe(own);
    });

    it.each([
      ['data:', 'data:image/png;base64,AAAA'],
      ['javascript:', 'javascript:alert(1)'],
      ['relativo', '/uploads/2026/10/28/abc123.png'],
      ['protocolo relativo', '//app.exemplo.com/uploads/a.png'],
      ['outro host', 'https://rastreio.exemplo.net/pixel.png'],
      ['host parecido', 'https://app.exemplo.com.evil.net/uploads/a.png'],
      ['fora de /uploads', 'https://app.exemplo.com/api/a.png'],
      ['.. saindo de /uploads', 'https://app.exemplo.com/uploads/../api/a.png'],
      ['credenciais na URL', 'https://u:p@app.exemplo.com/uploads/a.png'],
      ['aspas/entidade no path', "https://app.exemplo.com/uploads/a&quot;/b'.png"],
      ['nao string', 42],
    ])('recusa %s', (_caso, src) => {
      expect(normalizeOwnMediaUrl(src, prefixes)).toBeNull();
    });

    it('sem prefixos (navegador sem variaveis) nada passa', () => {
      expect(normalizeOwnMediaUrl(own, [])).toBeNull();
    });

    it('respeita RESTRICT_UPLOAD_DOMAINS quando configurado', () => {
      const restrict = process.env.RESTRICT_UPLOAD_DOMAINS;
      process.env.RESTRICT_UPLOAD_DOMAINS = 'midia.exemplo.com';
      try {
        expect(normalizeOwnMediaUrl(r2, prefixes)).toBe(r2);
        expect(normalizeOwnMediaUrl(own, prefixes)).toBeNull();
      } finally {
        if (restrict === undefined) {
          delete process.env.RESTRICT_UPLOAD_DOMAINS;
        } else {
          process.env.RESTRICT_UPLOAD_DOMAINS = restrict;
        }
      }
    });
  });

  describe('rewriteInlineImages', () => {
    it('nao toca HTML sem imagem', () => {
      const html = '<p>a &amp; b</p><ul><li>c</li></ul>';
      expect(rewriteInlineImages(html, { prefixes })).toBe(html);
    });

    it('mantem so src e alt da midia da instancia', () => {
      expect(
        rewriteInlineImages(
          `<p>a</p><img class="x" src="${own}" alt="capa" onerror="alert(1)" style="width:1px"><p>b</p>`,
          { prefixes }
        )
      ).toBe(`<p>a</p><img src="${own}" alt="capa"><p>b</p>`);
    });

    it('remove imagem de fora, data:, sem src e aninhada em outras tags', () => {
      expect(
        rewriteInlineImages(
          '<p>a<img src="https://rastreio.exemplo.net/p.gif"></p>' +
            '<img src="data:image/svg+xml;base64,PHN2Zz4=">' +
            '<IMG SRC=x onerror=alert(1)><img>' +
            '<ul><li><img src="javascript:alert(1)">b</li></ul>',
          { prefixes }
        )
      ).toBe('<p>a</p><ul><li>b</li></ul>');
    });

    it('mantem imagem dentro de link', () => {
      expect(
        rewriteInlineImages(`<a href="https://x.com"><img src="${own}"></a>`, {
          prefixes,
        })
      ).toBe(`<a href="https://x.com"><img src="${own}"></a>`);
    });

    it('nao reescreve <img dentro do valor de outro atributo', () => {
      const html = `<p><a href="https://x.com/?q=<img src=&quot;${own}&quot;>">t</a></p>`;
      expect(rewriteInlineImages(html, { prefixes })).toBe(html);
    });

    it('plainAlt tira aspas e & do alt (o modo html decodifica entidades)', () => {
      expect(
        rewriteInlineImages(
          `<img src="${own}" alt="x&quot; onerror=&quot;alert(1) &amp;quot; <b>">`,
          { prefixes, plainAlt: true }
        )
      ).toBe(`<img src="${own}" alt="x onerror=alert(1) quot; b">`);
    });
  });
});
