jest.mock('@gitroom/nestjs-libraries/upload/public-url.fetch', () => ({
  ...jest.requireActual('@gitroom/nestjs-libraries/upload/public-url.fetch'),
  fetchPublicUrl: jest.fn(),
}));

import { ExtractContentService } from './extract.content.service';
import {
  fetchPublicUrl,
  PublicUrlFetchError,
} from '@gitroom/nestjs-libraries/upload/public-url.fetch';

const mockFetchPublicUrl = fetchPublicUrl as jest.Mock;

// URL arbitraria (pagina a resumir): mesmo download SSRF-safe com teto do
// autopost, nunca fetch cru.
describe('ExtractContentService', () => {
  beforeEach(() => mockFetchPublicUrl.mockReset());

  it('baixa pelo helper SSRF-safe e extrai o bloco com titulos', async () => {
    mockFetchPublicUrl.mockResolvedValue({
      buffer: Buffer.from('<html><body><main><h1>Titulo</h1><p>Texto  longo</p></main></body></html>'),
      contentType: 'text/html; charset=utf-8',
    });

    const text = await new ExtractContentService().extractContent('https://blog.example.com/a');

    expect(mockFetchPublicUrl).toHaveBeenCalledWith(
      'https://blog.example.com/a',
      expect.objectContaining({ maxBytes: 5 * 1024 * 1024, allowHttp: true })
    );
    expect(text).toContain('Titulo');
  });

  it('URL recusada propaga o erro sem conectar', async () => {
    mockFetchPublicUrl.mockRejectedValue(new PublicUrlFetchError('unsafe', 'Unsafe URL'));
    await expect(
      new ExtractContentService().extractContent('http://169.254.169.254/')
    ).rejects.toBeInstanceOf(PublicUrlFetchError);
  });
});
