jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({ IntegrationManager: class IntegrationManagerMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/short-linking/short.link.service',
  () => ({ ShortLinkService: class ShortLinkServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { set: jest.fn(), get: jest.fn() },
}));

import { HttpException } from '@nestjs/common';
import { PostsService } from './posts.service';

const makePost = (overrides: Record<string, unknown> = {}) => ({
  id: 'post-1',
  group: 'g1',
  organizationId: 'org-1',
  profileId: 'prof-2',
  integrationId: 'int-1',
  releaseId: 'missing',
  image: '[]',
  settings: '{}',
  error: '{"refresh_token":"S"}',
  childrenPost: [] as any[],
  integration: {
    id: 'int-1',
    picture: 'p.png',
    providerIdentifier: 'tiktok',
    internalId: 'u1',
    profileId: 'prof-2',
    token: 'TOKEN',
    tokenExpiration: new Date(Date.now() + 86_400_000),
  },
  ...overrides,
});

const build = (post: any, provider: any = {}) => {
  const postRepository = {
    getPost: jest.fn().mockResolvedValue(post),
    getPostsByGroup: jest.fn().mockResolvedValue(post ? [post] : []),
    getPostById: jest.fn().mockResolvedValue(post),
    updateReleaseId: jest.fn().mockResolvedValue({ id: 'post-1' }),
  };
  const integrationManager = {
    getSocialIntegration: jest.fn().mockReturnValue(provider),
  };
  const refreshIntegrationService = { refresh: jest.fn() };
  const integrationService = { disconnectChannel: jest.fn() };
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
    { decrypt: jest.fn() } as any,
    {} as any
  );
  return { service, postRepository, refreshIntegrationService };
};

const expectHttp = async (promise: Promise<unknown>, status: number) => {
  let thrown: any;
  try {
    await promise;
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(HttpException);
  expect(thrown.getStatus()).toBe(status);
};

describe('PostsService.getPost (escopo por perfil + projecao)', () => {
  it('post de outro perfil responde 404 antes de tocar na midia', async () => {
    const { service } = build(makePost());
    const updateMedia = jest.spyOn(service, 'updateMedia');

    await expectHttp(service.getPost('org-1', 'post-1', false, 'prof-1'), 404);
    expect(updateMedia).not.toHaveBeenCalled();
  });

  it('post inexistente responde 404 (nao 500) com ou sem perfil', async () => {
    const { service } = build(null);
    await expectHttp(service.getPost('org-1', 'post-x', false, 'prof-1'), 404);
    await expectHttp(service.getPost('org-1', 'post-x'), 404);
  });

  it('perfil igual (ou sem perfil) devolve o post sem token nem error', async () => {
    const { service } = build(makePost());
    jest.spyOn(service, 'updateMedia').mockResolvedValue([] as any);

    const result = await service.getPost('org-1', 'post-1', false, 'prof-2');
    expect(result.posts[0]).not.toHaveProperty('error');
    expect(JSON.stringify(result)).not.toMatch(/TOKEN|refresh_token/);
    expect(result.integrationPicture).toBe('p.png');
    expect(result.integration).toBe('int-1');

    await expect(service.getPost('org-1', 'post-1')).resolves.toMatchObject({
      group: 'g1',
    });
  });
});

describe('PostsService.getPostsByGroup (escopo por perfil + projecao)', () => {
  it('grupo de outro perfil responde 404 e grupo vazio tambem', async () => {
    const { service } = build(makePost());
    await expectHttp(service.getPostsByGroup('org-1', 'g1', 'prof-1'), 404);

    const empty = build(null);
    await expectHttp(empty.service.getPostsByGroup('org-1', 'g0'), 404);
  });

  it('perfil igual devolve os posts projetados', async () => {
    const { service } = build(makePost());
    jest.spyOn(service, 'updateMedia').mockResolvedValue([] as any);

    const result = await service.getPostsByGroup('org-1', 'g1', 'prof-2');
    expect(JSON.stringify(result)).not.toMatch(/TOKEN|refresh_token/);
    expect(result.posts[0]).not.toHaveProperty('error');
  });

  it('grupo com raizes de perfis diferentes devolve so as do perfil', async () => {
    const mine = makePost({ id: 'post-1', profileId: 'prof-2' });
    const other = makePost({ id: 'post-2', profileId: 'prof-3' });
    const otherChild = makePost({ id: 'post-3', profileId: 'prof-3', parentPostId: 'post-2' });
    const { service, postRepository } = build(mine);
    postRepository.getPostsByGroup.mockResolvedValue([mine, other, otherChild]);
    jest.spyOn(service, 'updateMedia').mockResolvedValue([] as any);

    const result = await service.getPostsByGroup('org-1', 'g1', 'prof-2');
    expect(result.posts.map((p: any) => p.id)).toEqual(['post-1']);

    await expectHttp(service.getPostsByGroup('org-1', 'g1', 'prof-1'), 404);
  });
});

describe('PostsService.getMissingContent (escopo por perfil)', () => {
  it('post de outro perfil devolve vazio sem renovar token nem consultar o provider', async () => {
    const provider = { missing: jest.fn().mockResolvedValue([{ id: '1', url: 'u' }]) };
    const { service, refreshIntegrationService } = build(makePost(), provider);

    await expect(
      service.getMissingContent('org-1', 'post-1', false, 'prof-1')
    ).resolves.toEqual([]);
    expect(refreshIntegrationService.refresh).not.toHaveBeenCalled();
    expect(provider.missing).not.toHaveBeenCalled();
  });

  it('perfil igual consulta o provider', async () => {
    const provider = { missing: jest.fn().mockResolvedValue([{ id: '1', url: 'u' }]) };
    const { service } = build(makePost(), provider);

    await expect(
      service.getMissingContent('org-1', 'post-1', false, 'prof-2')
    ).resolves.toEqual([{ id: '1', url: 'u' }]);
  });
});

describe('PostsService.updateReleaseId (escopo por perfil)', () => {
  it('post de outro perfil responde 404 e nao grava', async () => {
    const { service, postRepository } = build(makePost());
    await expectHttp(
      service.updateReleaseId('org-1', 'post-1', 'v_pub_url~abc', 'prof-1'),
      404
    );
    expect(postRepository.updateReleaseId).not.toHaveBeenCalled();
  });

  it('post inexistente responde 404', async () => {
    const { service } = build(null);
    await expectHttp(service.updateReleaseId('org-1', 'post-x', '123'), 404);
  });

  it('perfil igual (ou sem perfil) grava pelo repositorio restrito a org', async () => {
    const { service, postRepository } = build(makePost());
    await service.updateReleaseId('org-1', 'post-1', '123', 'prof-2');
    await service.updateReleaseId('org-1', 'post-1', '123');
    expect(postRepository.updateReleaseId).toHaveBeenCalledTimes(2);
    expect(postRepository.updateReleaseId).toHaveBeenCalledWith('post-1', 'org-1', '123');
  });
});
