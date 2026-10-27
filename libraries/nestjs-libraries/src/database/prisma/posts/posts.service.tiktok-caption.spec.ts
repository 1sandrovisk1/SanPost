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

import { BadRequestException } from '@nestjs/common';

const bodyFor = (
  type: 'schedule' | 'now' | 'draft',
  __type: string,
  content: string,
  image: { path: string }[] = [{ path: 'https://cdn.example/v.mp4' }]
) => ({
  type,
  shortLink: false,
  date: '2026-11-01T17:00:00.000Z',
  tags: [] as { value: string; label: string }[],
  posts: [
    {
      integration: { id: 'int-1' },
      value: [{ content, image }],
      settings: { __type },
    },
  ],
});

const buildService = () => {
  const repo = createMock<PostsRepository>();
  const integrationService = createMock<IntegrationService>();
  repo.createOrUpdatePost.mockResolvedValue({
    posts: [{ id: 'post-1', state: 'QUEUE' }],
  } as any);
  integrationService.getIntegrationById.mockResolvedValue({ id: 'int-1', profileId: null } as any);
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
  return { service, repo };
};

// Dashboard, API publica e MCP passam por createPost: texto que o TikTok vai
// recusar e barrado na criacao (400 com o tamanho), nao na hora de publicar.
describe('PostsService.createPost - limite de texto do TikTok', () => {
  it.each(['tiktok', 'zernio-tiktok'])(
    '%s: agendar video com mais de 2.200 caracteres responde 400 sem gravar',
    async (identifier) => {
      const { service, repo } = buildService();
      const error = await service
        .createPost('org-1', bodyFor('schedule', identifier, `<p>${'a'.repeat(2201)}</p>`) as any)
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toMatch(/TikTok/);
      expect(error.message).toMatch(/2[.]?201/);
      expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
    }
  );

  it('publicar agora tambem e barrado; rascunho passa', async () => {
    const now = buildService();
    await expect(
      now.service.createPost('org-1', bodyFor('now', 'tiktok', 'a'.repeat(2300)) as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    const draft = buildService();
    await draft.service.createPost('org-1', bodyFor('draft', 'tiktok', 'a'.repeat(2300)) as any);
    expect(draft.repo.createOrUpdatePost).toHaveBeenCalled();
  });

  it('update tambem e barrado; sem midia conta como foto (4.000)', async () => {
    const update = buildService();
    await expect(
      update.service.createPost('org-1', bodyFor('update' as any, 'tiktok', 'a'.repeat(2300)) as any)
    ).rejects.toBeInstanceOf(BadRequestException);

    const noMedia = buildService();
    await noMedia.service.createPost('org-1', bodyFor('schedule', 'tiktok', 'a'.repeat(3000), []) as any);
    expect(noMedia.repo.createOrUpdatePost).toHaveBeenCalled();
  });

  it('com encurtador de links a checagem fica para o provider (texto ainda vai mudar)', async () => {
    const { service, repo } = buildService();
    (service as any)._shortLinkService = {
      convertTextToShortLinks: jest.fn(async (_org: string, messages: string[]) => messages),
    };
    await service.createPost('org-1', {
      ...bodyFor('schedule', 'tiktok', 'a'.repeat(2300)),
      shortLink: true,
    } as any);
    expect(repo.createOrUpdatePost).toHaveBeenCalled();
  });

  it('foto aceita ate 4.000; limite exato de video passa; outras redes nao sao afetadas', async () => {
    const photo = buildService();
    await photo.service.createPost(
      'org-1',
      bodyFor('schedule', 'tiktok', 'a'.repeat(3500), [{ path: 'https://cdn.example/f.jpg' }]) as any
    );
    expect(photo.repo.createOrUpdatePost).toHaveBeenCalled();

    const exact = buildService();
    await exact.service.createPost('org-1', bodyFor('schedule', 'tiktok', 'a'.repeat(2200)) as any);
    expect(exact.repo.createOrUpdatePost).toHaveBeenCalled();

    const other = buildService();
    await other.service.createPost('org-1', bodyFor('schedule', 'instagram', 'a'.repeat(2300)) as any);
    expect(other.repo.createOrUpdatePost).toHaveBeenCalled();
  });
});
