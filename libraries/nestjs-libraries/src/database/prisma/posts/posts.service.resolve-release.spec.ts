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
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { set: jest.fn(), get: jest.fn() },
}));

import { PostsService } from './posts.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { TOKEN_ENC_PREFIX } from '@gitroom/nestjs-libraries/crypto/integration-token.helper';

const BIG_ID = '7345678901234567891';
const RELEASE_URL = `https://www.tiktok.com/@perfil/video/${BIG_ID}`;

const makePost = () => ({
  id: 'post-1',
  organizationId: 'org-1',
  profileId: null as string | null,
  releaseId: 'v_pub_url~abc',
  releaseURL: 'https://www.tiktok.com/@perfil',
  integration: {
    id: 'int-1',
    internalId: 'user-1',
    providerIdentifier: 'tiktok',
    token: `${TOKEN_ENC_PREFIX}CIPHER`,
    tokenExpiration: new Date(Date.now() + 86_400_000),
  },
});

const build = (provider: any) => {
  const postRepository = {
    getPostById: jest.fn().mockResolvedValue(makePost()),
    updateResolvedRelease: jest.fn().mockResolvedValue({}),
  };
  const integrationManager = {
    getSocialIntegration: jest.fn().mockReturnValue(provider),
  };
  const integrationService = { disconnectChannel: jest.fn() };
  const refreshIntegrationService = {
    refresh: jest.fn().mockResolvedValue({ accessToken: 'NEW' }),
  };
  const encryption = { decrypt: jest.fn().mockReturnValue('PLAIN') };
  const service = new PostsService(
    postRepository as any,
    integrationManager as any,
    integrationService as any,
    null as any,
    null as any,
    null as any,
    null as any,
    refreshIntegrationService as any,
    null as any,
    encryption as any,
    {} as any
  );
  return { service, postRepository, refreshIntegrationService, encryption };
};

// Porte do upstream #2186: o publish_id guardado como releaseId e trocado pelo
// id publico (e URL definitiva) assim que a plataforma o expoe.
describe('PostsService.resolveRelease', () => {
  beforeEach(() => {
    (ioRedis.get as jest.Mock).mockReset();
    (ioRedis.set as jest.Mock).mockReset();
  });

  it('publish_id sem id publico entra no cache negativo (5 min) e nao consulta de novo', async () => {
    const provider = { resolveReleaseId: jest.fn().mockResolvedValue(undefined) };
    const { service } = build(provider);

    await service.resolveRelease('org-1', makePost() as any);
    expect(ioRedis.set).toHaveBeenCalledWith(
      'release-resolve:org-1:post-1',
      '1',
      'EX',
      300
    );

    (ioRedis.get as jest.Mock).mockResolvedValueOnce('1');
    await expect(
      service.resolveRelease('org-1', makePost() as any)
    ).resolves.toEqual({
      releaseId: 'v_pub_url~abc',
      releaseURL: 'https://www.tiktok.com/@perfil',
    });
    expect(provider.resolveReleaseId).toHaveBeenCalledTimes(1);
  });

  it('provider sem resolveReleaseId mantem o que esta salvo, sem persistir', async () => {
    const { service, postRepository } = build({});
    await expect(
      service.resolveRelease('org-1', makePost() as any)
    ).resolves.toEqual({
      releaseId: 'v_pub_url~abc',
      releaseURL: 'https://www.tiktok.com/@perfil',
    });
    expect(postRepository.updateResolvedRelease).not.toHaveBeenCalled();
  });

  it('id resolvido igual ao salvo nao persiste', async () => {
    const provider = {
      resolveReleaseId: jest
        .fn()
        .mockResolvedValue({ postId: 'v_pub_url~abc', releaseURL: 'x' }),
    };
    const { service, postRepository } = build(provider);
    await service.resolveRelease('org-1', makePost() as any);
    expect(postRepository.updateResolvedRelease).not.toHaveBeenCalled();
  });

  it('id resolvido diferente persiste id + URL (restrito a org) e devolve o novo par', async () => {
    const provider = {
      resolveReleaseId: jest
        .fn()
        .mockResolvedValue({ postId: BIG_ID, releaseURL: RELEASE_URL }),
    };
    const { service, postRepository } = build(provider);
    const post = makePost();

    await expect(service.resolveRelease('org-1', post as any)).resolves.toEqual({
      releaseId: BIG_ID,
      releaseURL: RELEASE_URL,
    });
    expect(provider.resolveReleaseId).toHaveBeenCalledWith(
      post.integration.token,
      'v_pub_url~abc',
      post.integration
    );
    expect(postRepository.updateResolvedRelease).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      'v_pub_url~abc',
      BIG_ID,
      RELEASE_URL
    );
  });
});

describe('PostsService.checkPostAnalytics com resolucao do releaseId', () => {
  it('resolve apos descriptografar o token e passa o id publico (e a integracao) ao postAnalytics', async () => {
    const provider = {
      resolveReleaseId: jest
        .fn()
        .mockResolvedValue({ postId: BIG_ID, releaseURL: RELEASE_URL }),
      postAnalytics: jest.fn().mockResolvedValue([{ label: 'Views' }]),
    };
    const { service, postRepository, encryption } = build(provider);

    await expect(
      service.checkPostAnalytics('org-1', 'post-1', 7)
    ).resolves.toEqual([{ label: 'Views' }]);

    expect(encryption.decrypt).toHaveBeenCalledWith('CIPHER');
    expect(provider.resolveReleaseId).toHaveBeenCalledWith(
      'PLAIN',
      'v_pub_url~abc',
      expect.objectContaining({ id: 'int-1', token: 'PLAIN' })
    );
    expect(postRepository.updateResolvedRelease).toHaveBeenCalledWith(
      'post-1',
      'org-1',
      'v_pub_url~abc',
      BIG_ID,
      RELEASE_URL
    );
    expect(provider.postAnalytics).toHaveBeenCalledWith(
      'user-1',
      'PLAIN',
      BIG_ID,
      7,
      expect.objectContaining({ id: 'int-1' })
    );
  });

  it('RefreshToken na resolucao cai no refresh e tenta de novo uma vez', async () => {
    const provider = {
      resolveReleaseId: jest
        .fn()
        .mockRejectedValueOnce(new RefreshToken('tiktok', '{}', '{}'))
        .mockResolvedValueOnce(undefined),
      postAnalytics: jest.fn().mockResolvedValue([]),
    };
    const { service, refreshIntegrationService } = build(provider);

    await expect(
      service.checkPostAnalytics('org-1', 'post-1', 7)
    ).resolves.toEqual([]);

    expect(refreshIntegrationService.refresh).toHaveBeenCalledTimes(1);
    expect(provider.postAnalytics).toHaveBeenCalledTimes(1);
    expect(provider.postAnalytics).toHaveBeenCalledWith(
      'user-1',
      'NEW',
      'v_pub_url~abc',
      7,
      expect.anything()
    );
  });
});
