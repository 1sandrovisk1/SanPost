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
import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostsRepository } from './posts.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';


// Porte do upstream a194e3f4: posts salvos juntos para varios canais formam um
// lote; o editor abre os irmaos e cada canal pode ter data propria.
const channel = (id: string, extra: Record<string, unknown> = {}) => ({
  integration: { id },
  value: [{ content: '<p>texto</p>' }],
  settings: { __type: 'instagram' },
  ...extra,
});

const body = (posts: any[], type = 'schedule') => ({
  type,
  shortLink: false,
  date: '2026-11-10T12:00:00.000Z',
  tags: [] as any[],
  posts,
});

const buildService = (
  repo: ReturnType<typeof createMock<PostsRepository>>,
  integrationService: ReturnType<typeof createMock<IntegrationService>>
) => {
  const service = new PostsService(
    repo as any,
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
  jest.spyOn(service as any, 'startWorkflow').mockResolvedValue(undefined);
  jest
    .spyOn(service, 'updateMedia')
    .mockImplementation(async (_id: string, media: any[]) => media as any);
  return service;
};

describe('PostsService.createPost - lote', () => {
  let repo: ReturnType<typeof createMock<PostsRepository>>;
  let integrationService: ReturnType<typeof createMock<IntegrationService>>;

  beforeEach(() => {
    repo = createMock<PostsRepository>();
    integrationService = createMock<IntegrationService>();
    repo.createOrUpdatePost.mockResolvedValue({
      posts: [{ id: 'post-1', state: 'QUEUE' }],
    } as any);
  });

  it('varios canais do mesmo perfil dividem um lote; batchId do cliente e ignorado', async () => {
    const service = buildService(repo, integrationService);

    await service.createPost(
      'org-1',
      body([channel('int-1', { batchId: 'forjado' }), channel('int-2')]) as any,
      'perfil-1'
    );

    const [a, b] = repo.createOrUpdatePost.mock.calls.map((c) => c[7]);
    expect(a).toEqual(expect.any(String));
    expect(a).not.toBe('forjado');
    expect(b).toBe(a);
  });

  it('chave de org: um lote por perfil de destino, e canal sem perfil fica fora', async () => {
    const profiles: Record<string, string | null> = {
      'int-1': 'p1',
      'int-2': 'p2',
      'int-3': 'p1',
      'int-4': null,
    };
    (integrationService.getIntegrationById as jest.Mock).mockImplementation(
      async (_org: string, id: string) => ({ id, profileId: profiles[id] })
    );
    const service = buildService(repo, integrationService);

    await service.createPost(
      'org-1',
      body([channel('int-1'), channel('int-2'), channel('int-3'), channel('int-4')]) as any
    );

    const batches = repo.createOrUpdatePost.mock.calls.map((c) => c[7]);
    expect(batches[0]).toBe(batches[2]);
    expect(batches[1]).not.toBe(batches[0]);
    expect(batches[3]).toBeUndefined();
  });

  it('um canal so nao forma lote', async () => {
    const service = buildService(repo, integrationService);

    await service.createPost('org-1', body([channel('int-1')]) as any, 'perfil-1');

    expect(repo.createOrUpdatePost.mock.calls[0][7]).toBeUndefined();
  });

  it('data por canal vale no agendamento; publicar agora ignora', async () => {
    const service = buildService(repo, integrationService);

    await service.createPost(
      'org-1',
      body([channel('int-1', { date: '2026-11-12T09:00:00.000Z' }), channel('int-2')]) as any,
      'perfil-1'
    );
    expect(repo.createOrUpdatePost.mock.calls[0][2]).toBe('2026-11-12T09:00:00.000Z');
    expect(repo.createOrUpdatePost.mock.calls[1][2]).toBe('2026-11-10T12:00:00.000Z');

    repo.createOrUpdatePost.mockClear();
    await service.createPost(
      'org-1',
      body([channel('int-1', { date: '2026-11-12T09:00:00.000Z' })], 'now') as any,
      'perfil-1'
    );
    expect(repo.createOrUpdatePost.mock.calls[0][2]).not.toBe('2026-11-12T09:00:00.000Z');
  });
});

describe('PostsService.getPostsByGroup - irmaos do lote', () => {
  const root = (over: Record<string, unknown> = {}) => ({
    id: 'p-1',
    group: 'g-1',
    batchId: 'b-1',
    parentPostId: null as string | null,
    profileId: 'perfil-1',
    integrationId: 'int-1',
    intervalInDays: null as number | null,
    image: '[]',
    settings: '{}',
    integration: { id: 'int-1', token: 'segredo', picture: 'pic' },
    ...over,
  });

  const build = (anchor: any, batch: any[]) => {
    const repo = createMock<PostsRepository>();
    repo.getPostsByGroup.mockResolvedValue([anchor] as any);
    repo.getPostsByBatch.mockResolvedValue(batch as any);
    const service = buildService(repo, createMock<IntegrationService>());
    return { repo, service };
  };

  it('traz um irmao por canal, do perfil do post, com a mesma repeticao e sem token', async () => {
    const { repo, service } = build(root(), [
      root({ id: 'p-2', group: 'g-2', integrationId: 'int-2', integration: { id: 'int-2', token: 'x' } }),
      root({ id: 'p-3', group: 'g-3', integrationId: 'int-2', integration: { id: 'int-2', token: 'x' } }),
      root({ id: 'p-4', group: 'g-4', integrationId: 'int-3', intervalInDays: 7, integration: { id: 'int-3' } }),
      root({ id: 'p-5', group: 'g-5', integrationId: 'int-4', profileId: 'outro', integration: { id: 'int-4' } }),
      root({ id: 'p-6', group: 'g-6', integrationId: 'int-1', integration: { id: 'int-1' } }),
    ]);

    const result = await service.getPostsByGroup('org-1', 'g-1', 'perfil-1');

    expect(repo.getPostsByBatch).toHaveBeenCalledWith('org-1', 'b-1', 'g-1', 'perfil-1');
    expect(result.siblings.map((s: any) => s.posts[0].id)).toEqual(['p-2']);
    expect(JSON.stringify(result)).not.toContain('segredo');
    expect(JSON.stringify(result)).not.toContain('"batchId"');
    expect(service.updateMedia).not.toHaveBeenCalledWith('p-5', expect.anything(), expect.anything());
  });

  it('post sem lote (antigo) abre sozinho sem consultar o lote', async () => {
    const { repo, service } = build(root({ batchId: null }), []);

    const result = await service.getPostsByGroup('org-1', 'g-1', 'perfil-1');

    expect(repo.getPostsByBatch).not.toHaveBeenCalled();
    expect(result.siblings).toEqual([]);
  });
});

describe('PostsService.stripEditorOnlyFields', () => {
  it('remove data por canal e lote dos posts da API publica', () => {
    const service = buildService(createMock<PostsRepository>(), createMock<IntegrationService>());

    expect(
      service.stripEditorOnlyFields({
        type: 'schedule',
        posts: [{ integration: { id: 'i' }, date: '2026-01-01', batchId: 'b', value: [] }],
      })
    ).toEqual({ type: 'schedule', posts: [{ integration: { id: 'i' }, value: [] }] });
    expect(service.stripEditorOnlyFields({ posts: 'x' } as any)).toEqual({ posts: 'x' });
    expect(service.stripEditorOnlyFields(undefined as any)).toBeUndefined();
  });
});
