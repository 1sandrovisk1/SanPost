jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkServiceMock {},
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => {
  const storage = { uploadFile: jest.fn() };
  return { UploadFactory: { createStorage: () => storage }, __storage: storage };
});
jest.mock('sharp', () => () => ({
  jpeg: () => ({ toBuffer: async () => Buffer.from('jpeg') }),
}));
jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  ...jest.requireActual('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher'),
  getSsrfSafeAxios: jest.fn(),
}));

import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { PostsService } from './posts.service';

const fs = jest.requireActual('fs') as typeof import('fs');
const { __storage } = jest.requireMock(
  '@gitroom/nestjs-libraries/upload/upload.factory'
) as { __storage: { uploadFile: jest.Mock } };

const ENV = {
  UPLOAD_DIRECTORY: process.env.UPLOAD_DIRECTORY,
  FRONTEND_URL: process.env.FRONTEND_URL,
  NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY:
    process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY,
};

const buildService = () => {
  const postRepository = { updateImages: jest.fn().mockResolvedValue(undefined) };
  const mediaService = { getMediaById: jest.fn() };
  const service = new PostsService(
    postRepository as any,
    null as any,
    null as any,
    mediaService as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    {} as any,
    {} as any
  );
  return { service, postRepository, mediaService };
};

// Caminho local de midia vem do cliente (DTO do post, tool MCP) e e lido do
// disco pelos providers: precisa ficar confinado em UPLOAD_DIRECTORY ANTES do
// try/catch, cujo catch devolve a lista ao chamador.
describe('PostsService.updateMedia - confinamento do path de midia', () => {
  let readSpy: jest.SpyInstance;
  let axiosFn: jest.Mock;

  beforeEach(() => {
    process.env.UPLOAD_DIRECTORY = '/srv/uploads';
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
    process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY = 'uploads';
    readSpy = jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue(Buffer.from('png-local') as any);
    axiosFn = jest.fn().mockResolvedValue({ data: Buffer.from('png-remoto') });
    (getSsrfSafeAxios as jest.Mock).mockReturnValue(axiosFn);
    __storage.uploadFile.mockResolvedValue({
      path: '/2026/10/23/convertido.jpg',
      originalname: 'convertido.jpg',
    });
  });

  afterEach(() => {
    readSpy.mockRestore();
    jest.clearAllMocks();
    for (const [key, value] of Object.entries(ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('descarta path traversal antes de qualquer IO e resolve os itens por id', async () => {
    const { service, mediaService, postRepository } = buildService();
    mediaService.getMediaById.mockResolvedValue({
      id: 'm-1',
      path: '/2026/10/23/a.png',
    });

    const result = await service.updateMedia('post-1', [
      { path: '/../../etc/passwd' },
      { path: '/2026/http/b.png' },
      { id: 'm-1' },
    ]);

    expect(mediaService.getMediaById).toHaveBeenCalledTimes(1);
    expect(mediaService.getMediaById).toHaveBeenCalledWith('m-1');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'm-1',
      path: '/srv/uploads/2026/10/23/a.png',
      url: 'https://app.exemplo.com/uploads/2026/10/23/a.png',
    });
    expect(readSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(postRepository.updateImages.mock.calls)).not.toContain(
      'passwd'
    );
  });

  it('quando algo falha dentro do try devolve so caminhos confinados e ja prefixados', async () => {
    const { service, mediaService } = buildService();
    mediaService.getMediaById.mockRejectedValue(new Error('banco fora'));

    const result = await service.updateMedia('post-1', [
      { path: '/../../etc/passwd' },
      { path: '/etc/passwd' },
      { id: 'm-1' },
      { path: '/2026/10/23/ok.png' },
      { path: 'https://cdn.exemplo.com/r.png' },
    ]);

    // `/etc/passwd` e aceito pelo guard como caminho RELATIVO a UPLOAD_DIRECTORY;
    // por isso o catch tambem precisa prefixar, nunca devolver o valor cru.
    expect(result).toEqual([
      {
        path: '/srv/uploads/etc/passwd',
        url: 'https://app.exemplo.com/uploads/etc/passwd',
        type: 'image',
      },
      {
        path: '/srv/uploads/2026/10/23/ok.png',
        url: 'https://app.exemplo.com/uploads/2026/10/23/ok.png',
        type: 'image',
      },
      {
        path: 'https://cdn.exemplo.com/r.png',
        url: 'https://cdn.exemplo.com/r.png',
        type: 'image',
      },
    ]);
  });

  it('converte PNG local lendo do disco (caminho ja confinado), sem axios', async () => {
    const { service } = buildService();

    const result = await service.updateMedia(
      'post-1',
      [{ path: '/2026/10/23/a.png' }],
      true
    );

    expect(readSpy).toHaveBeenCalledWith('/srv/uploads/2026/10/23/a.png');
    expect(axiosFn).not.toHaveBeenCalled();
    expect(__storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({
      path: '/srv/uploads/2026/10/23/convertido.jpg',
    });
  });

  it('converte PNG remoto pelo cliente SSRF-safe, nunca pelo axios global', async () => {
    const { service } = buildService();

    await service.updateMedia(
      'post-1',
      [{ path: 'https://cdn.exemplo.com/a.png' }],
      true
    );

    expect(axiosFn).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cdn.exemplo.com/a.png',
        method: 'GET',
        responseType: 'arraybuffer',
      })
    );
    expect(readSpy).not.toHaveBeenCalled();
  });
});
