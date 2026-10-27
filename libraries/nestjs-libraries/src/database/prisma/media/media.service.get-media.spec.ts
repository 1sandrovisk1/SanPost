// MediaService importa SubscriptionService que cascateia ate nostr-tools
// (ESM-only que quebra ts-jest). Mockamos topo-de-modulo as cadeias pesadas.
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  () => ({ SubscriptionService: class SubscriptionServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/videos/video.manager',
  () => ({ VideoManager: class VideoManagerMock {} })
);
jest.mock(
  '@gitroom/backend/services/auth/permissions/permission.exception.class',
  () => ({
    AuthorizationActions: { Create: 'Create', Delete: 'Delete', Update: 'Update' },
    Sections: { ADMIN: 'ADMIN', VIDEOS_PER_MONTH: 'VIDEOS_PER_MONTH' },
    SubscriptionException: class SubscriptionExceptionMock extends Error {
      constructor(public meta: any) { super('SubscriptionException'); }
    },
  })
);

const mockStorage = {
  uploadSimple: jest.fn(),
  uploadFile: jest.fn(),
  removeFile: jest.fn(),
  healthCheck: jest.fn(),
};
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => mockStorage },
}));

import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';

const buildService = () => {
  const repository = createMock<MediaRepository>();
  repository.findPendingPostsUsingMedia.mockResolvedValue([] as any);
  repository.findMediaReferencingPaths.mockResolvedValue([] as any);
  repository.deleteMediaBulk.mockResolvedValue({ count: 0 } as any);

  const service = new MediaService(
    repository,
    null as any, // openaiService legacy
    null as any, // subscriptionService
    null as any, // videoManager
    null as any, // aiImageService
    null as any, // aiTextService
    null as any // aiVideoService
  );

  return { service, repository };
};

// #1926: a busca pelo nome original (API publica e MCP) chega ao repositorio
// junto com o perfil; o dashboard continua sem busca.
describe('MediaService.getMedia', () => {
  it('repassa perfil e busca ao repositorio', async () => {
    const { service, repository } = buildService();
    repository.getMedia.mockResolvedValue({ pages: 1, results: [] } as any);

    await service.getMedia('org-1', 2, 'prof-1', 'logo');
    expect(repository.getMedia).toHaveBeenCalledWith('org-1', 2, 'prof-1', 'logo');

    await service.getMedia('org-1', 1, undefined);
    expect(repository.getMedia).toHaveBeenLastCalledWith('org-1', 1, undefined, undefined);
  });
});
