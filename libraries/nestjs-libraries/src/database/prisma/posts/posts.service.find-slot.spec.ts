// Mocks topo-de-modulo: PostsService importa IntegrationManager (carrega
// nostr.provider, ESM-only que quebra ts-jest), MediaService (alias
// @gitroom/backend nao mapeado no jest das libraries) e ShortLinkService.
// Nada disso e usado pelo caminho de derivacao de profileId em createPost.
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

import { PostsService } from './posts.service';

// Porte do upstream #2207: sem horarios (todos os canais desativados) a busca
// recursiva nunca terminava — cada dia vazio chamava o proximo para sempre.
describe('PostsService.findFreeDateTime', () => {
  const build = (times: number[], counts: (call: number) => number[]) => {
    let call = 0;
    const repository = {
      getPostsCountsByDates: jest.fn(async (..._args: unknown[]) => counts(call++)),
    };
    const integrationService = {
      findFreeDateTime: jest.fn().mockResolvedValue(times),
      validateIntegrationProfile: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PostsService(
      repository as any,
      null as any,
      integrationService as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      {} as any,
      {} as any
    );
    return { service, repository, integrationService };
  };

  it('sem horarios configurados usa os horarios padrao em vez de recursar para sempre', async () => {
    const { service, repository } = build([], () => [400]);
    await expect(service.findFreeDateTime('org-1')).resolves.toMatch(/T06:40:00$/);
    expect(repository.getPostsCountsByDates.mock.calls[0][1]).toEqual([120, 400, 700]);
  });

  it('desiste depois de um ano sem vaga e devolve o primeiro horario', async () => {
    const { service, repository } = build([600], () => []);
    const result = await service.findFreeDateTime('org-1');
    expect(result).toMatch(/T10:00:00$/);
    expect(repository.getPostsCountsByDates.mock.calls.length).toBeLessThanOrEqual(367);
  });

  it('com vaga no primeiro dia usa o menor horario livre', async () => {
    const { service } = build([600, 120], () => [600, 120]);
    await expect(service.findFreeDateTime('org-1', 'int-1', 'prof-1')).resolves.toMatch(/T02:00:00$/);
  });

  it('horarios de um canal so para quem alcanca o canal (perfil)', async () => {
    const { service, integrationService, repository } = build([600], () => [600]);
    integrationService.validateIntegrationProfile.mockRejectedValueOnce(
      Object.assign(new Error('Integration does not belong to this profile'), { status: 403 })
    );

    await expect(service.findFreeDateTime('org-1', 'int-outro', 'prof-1')).rejects.toMatchObject({
      status: 403,
    });
    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledWith('org-1', 'int-outro', 'prof-1');
    expect(repository.getPostsCountsByDates).not.toHaveBeenCalled();

    // sem perfil (admin sem perfil ativo) ou sem canal: nao valida
    await service.findFreeDateTime('org-1', 'int-1');
    await service.findFreeDateTime('org-1', undefined, 'prof-1');
    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledTimes(1);
  });
});
