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

import { HttpException, Logger } from '@nestjs/common';
import { BadBody, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';
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

  it('erro do provider e logado resumido, sem o corpo da resposta', async () => {
    const provider = {
      missing: jest
        .fn()
        .mockRejectedValue(
          new BadBody('tiktok', '{"refresh_token":"SECRET"}', Buffer.from('SECRET'), '')
        ),
    };
    const { service } = build(makePost(), provider);
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      await expect(
        service.getMissingContent('org-1', 'post-1', false, 'prof-2')
      ).resolves.toEqual([]);
      expect(consoleLog).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('provider=tiktok'));
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET/);
    } finally {
      consoleLog.mockRestore();
      warn.mockRestore();
    }
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

// /posts/:id/statistics e /posts/old: mesma regra das rotas de revisao do post
// (membro USER so no proprio perfil -> 403; admin sem restricao; 404 se nao existe).
describe('PostsService.getStatistics / getOldPosts (escopo por perfil)', () => {
  const buildStats = (scope: { id: string; profileId: string | null } | null) => {
    const postRepository = {
      getPostProfileScope: jest.fn().mockResolvedValue(scope),
      getPost: jest
        .fn()
        .mockResolvedValue(scope ? { id: 'post-1', content: 'c', childrenPost: [] } : null),
      getOldPosts: jest.fn().mockResolvedValue([]),
    };
    const shortLinkService = {
      getStatistics: jest.fn().mockResolvedValue([{ short: 's', original: 'o', clicks: 3 }]),
    };
    const service = new PostsService(
      postRepository as any,
      {} as any,
      {} as any,
      null as any,
      shortLinkService as any,
      null as any,
      null as any,
      null as any,
      null as any,
      { decrypt: jest.fn() } as any,
      {} as any
    );
    return { service, postRepository, shortLinkService };
  };

  it('USER de outro perfil recebe 403 sem consultar os cliques', async () => {
    const { service, shortLinkService } = buildStats({ id: 'post-1', profileId: 'prof-2' });
    await expectHttp(service.getStatistics('org-1', 'post-1', 'prof-1'), 403);
    expect(shortLinkService.getStatistics).not.toHaveBeenCalled();
  });

  it('USER do mesmo perfil e admin (sem restricao) recebem os cliques', async () => {
    const { service } = buildStats({ id: 'post-1', profileId: 'prof-2' });
    await expect(service.getStatistics('org-1', 'post-1', 'prof-2')).resolves.toEqual({
      clicks: [{ short: 's', original: 'o', clicks: 3 }],
    });
    await expect(service.getStatistics('org-1', 'post-1')).resolves.toMatchObject({
      clicks: expect.any(Array),
    });
  });

  it('post inexistente responde 404', async () => {
    const { service } = buildStats(null);
    await expectHttp(service.getStatistics('org-1', 'post-x'), 404);
  });

  it('getOldPosts repassa o perfil ao repositorio', async () => {
    const { service, postRepository } = buildStats(null);
    await service.getOldPosts('org-1', '2026-10-26', 'prof-1');
    expect(postRepository.getOldPosts).toHaveBeenCalledWith('org-1', '2026-10-26', 'prof-1');
  });
});

// Porte do upstream #2247: DELETE da API publica devolve o id do post apagado.
describe('PostsService.deletePost (retorno)', () => {
  const buildDelete = (deleted: { id: string } | null) => {
    const postRepository = { deletePost: jest.fn().mockResolvedValue(deleted) };
    const temporalService = {
      client: {
        getRawClient: () => ({
          workflow: {
            list: async function* () {
              // nenhum workflow rodando
            },
          },
        }),
      },
    };
    return new PostsService(
      postRepository as any,
      {} as any,
      {} as any,
      null as any,
      null as any,
      null as any,
      temporalService as any,
      null as any,
      null as any,
      { decrypt: jest.fn() } as any,
      {} as any
    );
  };

  it('devolve { id } do post apagado', async () => {
    await expect(buildDelete({ id: 'post-9' }).deletePost('org-1', 'g1')).resolves.toEqual({
      id: 'post-9',
    });
  });

  it('grupo inexistente continua devolvendo { error: true }', async () => {
    await expect(buildDelete(null).deletePost('org-1', 'g-x')).resolves.toEqual({ error: true });
  });
});

// upstream 96b78476: RefreshToken depois de um refresh bem-sucedido recursava
// para sempre (cada volta chamava o refresh do provider de novo).
describe('PostsService - uma unica nova tentativa apos RefreshToken', () => {
  it('checkPostAnalytics tenta de novo uma vez e desiste', async () => {
    const provider = {
      postAnalytics: jest
        .fn()
        .mockRejectedValue(new RefreshToken('youtube', '{}', '{}', 'expired')),
    };
    const { service, refreshIntegrationService } = build(
      makePost({ releaseId: 'vid-1', integration: { ...makePost().integration, providerIdentifier: 'youtube' } }),
      provider
    );
    refreshIntegrationService.refresh.mockResolvedValue({ accessToken: 'novo' });
    jest.spyOn(service as any, 'resolveRelease').mockResolvedValue({ releaseId: 'vid-1' });

    await expect(service.checkPostAnalytics('org-1', 'post-1', 7, false, 'prof-2')).resolves.toEqual([]);
    expect(provider.postAnalytics).toHaveBeenCalledTimes(2);
  });

  it('getMissingContent tenta de novo uma vez e desiste', async () => {
    const provider = {
      missing: jest.fn().mockRejectedValue(new RefreshToken('tiktok', '{}', '{}', 'expired')),
    };
    const { service, refreshIntegrationService } = build(makePost(), provider);
    refreshIntegrationService.refresh.mockResolvedValue({ accessToken: 'novo' });

    await expect(service.getMissingContent('org-1', 'post-1', false, 'prof-2')).resolves.toEqual([]);
    expect(provider.missing).toHaveBeenCalledTimes(2);
  });
});
