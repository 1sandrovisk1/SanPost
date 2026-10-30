import { ShortLinkService } from './short.link.service';

// Imagem inline (upstream 2aae02fe): o src de <img> tem de continuar sendo a
// midia da instancia — encurtado, o sanitizer e a publicacao derrubam a
// imagem. Os outros links seguem encurtados como antes.
describe('ShortLinkService com imagem inline', () => {
  const original = ShortLinkService.provider;
  const picture = 'https://app.exemplo.com/uploads/2026/10/28/abc.png';
  const convertLinkToShortLink = jest.fn(
    async (_id: string, url: string) => `https://sho.rt/${url.length}`
  );

  beforeEach(() => {
    convertLinkToShortLink.mockClear();
    ShortLinkService.provider = {
      shortLinkDomain: 'sho.rt',
      convertLinkToShortLink,
    } as any;
  });

  afterAll(() => {
    ShortLinkService.provider = original;
  });

  it('nao encurta o src da imagem e encurta o link do texto', async () => {
    const service = new ShortLinkService();
    const [out] = await service.convertTextToShortLinks('org', [
      `<p>veja https://loja.exemplo.com/oferta</p><img src="${picture}" alt="capa">`,
    ]);

    expect(out).toContain(`<img src="${picture}" alt="capa">`);
    expect(out).not.toContain('https://loja.exemplo.com/oferta');
    expect(convertLinkToShortLink).toHaveBeenCalledTimes(1);
    expect(convertLinkToShortLink).toHaveBeenCalledWith(
      'org',
      'https://loja.exemplo.com/oferta'
    );
  });

  it('nao pergunta se encurta quando a unica URL e a da imagem', () => {
    const service = new ShortLinkService();
    expect(
      service.askShortLinkedin([`<p>oi</p><img src="${picture}">`])
    ).toBe(false);
    expect(
      service.askShortLinkedin([
        `<p>https://loja.exemplo.com</p><img src="${picture}">`,
      ])
    ).toBe(true);
  });
});
