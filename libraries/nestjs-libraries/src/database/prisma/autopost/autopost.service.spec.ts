jest.mock('@gitroom/nestjs-libraries/upload/public-url.fetch', () => ({
  ...jest.requireActual('@gitroom/nestjs-libraries/upload/public-url.fetch'),
  fetchPublicUrl: jest.fn(),
}));

// PostsService/IntegrationService puxam todos os providers (nostr-tools e ESM)
jest.mock('@gitroom/nestjs-libraries/database/prisma/posts/posts.service', () => ({
  PostsService: class PostsServiceMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationServiceMock {} })
);

import Parser from 'rss-parser';
import { AutopostService } from './autopost.service';
import {
  fetchPublicUrl,
  PublicUrlFetchError,
} from '@gitroom/nestjs-libraries/upload/public-url.fetch';

const mockFetchPublicUrl = fetchPublicUrl as jest.Mock;

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Blog</title>
<item><title>Antigo</title><link>https://blog.example.com/antigo</link>
<pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate><description>velho</description></item>
<item><title>Novo</title><link>https://blog.example.com/novo</link>
<pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Conteúdo novo</p>]]></description></item>
</channel></rss>`;

const build = () =>
  new AutopostService(
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

// Feed e artigo sao URLs de terceiros: nada de rss-parser.parseURL nem fetch
// cru (sem guard SSRF, sem limite, 5 redirects).
describe('AutopostService downloads', () => {
  beforeEach(() => {
    mockFetchPublicUrl.mockReset();
  });

  it('loadXML baixa o feed pelo helper SSRF-safe e parseia o texto', async () => {
    const parseUrl = jest.spyOn(Parser.prototype, 'parseURL');
    mockFetchPublicUrl.mockResolvedValue({
      buffer: Buffer.from(RSS),
      contentType: 'application/rss+xml; charset=utf-8',
    });

    const result = await build().loadXML('https://blog.example.com/feed');

    expect(mockFetchPublicUrl).toHaveBeenCalledWith(
      'https://blog.example.com/feed',
      expect.objectContaining({
        maxBytes: 5 * 1024 * 1024,
        honorSsrfOptOut: true,
        // feeds atras de WAF recusam o UA padrao do undici
        headers: expect.objectContaining({
          'User-Agent': expect.stringMatching(/^RoboMultipost\//),
          Accept: expect.stringContaining('application/rss+xml'),
        }),
      })
    );
    expect(parseUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      url: 'https://blog.example.com/novo',
      description: 'Conteúdo novo',
    });
  });

  it('loadXML com URL recusada devolve success false', async () => {
    mockFetchPublicUrl.mockRejectedValue(new PublicUrlFetchError('unsafe', 'Unsafe URL'));

    await expect(build().loadXML('https://10.0.0.1/feed')).resolves.toEqual({
      success: false,
    });
  });

  it('loadUrl aceita link http do feed, sempre pelo dispatcher pinado, e remove scripts', async () => {
    mockFetchPublicUrl.mockResolvedValue({
      buffer: Buffer.from('<html><body><script>x()</script><p>Texto</p></body></html>'),
      contentType: 'text/html',
    });

    const text = await build().loadUrl('http://blog.example.com/post');

    expect(mockFetchPublicUrl).toHaveBeenCalledWith(
      'http://blog.example.com/post',
      expect.objectContaining({ maxBytes: 5 * 1024 * 1024, allowHttp: true })
    );
    expect(mockFetchPublicUrl.mock.calls[0][1].honorSsrfOptOut).toBeFalsy();
    expect(text).toContain('Texto');
    expect(text).not.toContain('x()');
  });

  it('loadUrl com link recusado devolve texto vazio', async () => {
    mockFetchPublicUrl.mockRejectedValue(new PublicUrlFetchError('unsafe', 'Unsafe URL'));

    await expect(build().loadUrl('http://169.254.169.254/')).resolves.toBe('');
  });
});
