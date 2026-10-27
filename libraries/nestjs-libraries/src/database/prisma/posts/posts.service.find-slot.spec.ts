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
    const integrationService = { findFreeDateTime: jest.fn().mockResolvedValue(times) };
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
    return { service, repository };
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
});
