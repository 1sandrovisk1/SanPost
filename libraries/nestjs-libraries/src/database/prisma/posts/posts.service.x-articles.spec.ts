jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class {},
}));

import { BadRequestException } from '@nestjs/common';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { IntegrationService } from '../integrations/integration.service';
import { PostsRepository } from './posts.repository';
import { PostsService } from './posts.service';

const audio = { id: '123', audio_volume: 0, video_volume: 100 };
const makePost = (
  settings: Record<string, unknown> = { audio },
  paths = ['https://cdn.test/reel.mp4'],
  integrationId = 'int-1'
) => ({
  integration: { id: integrationId },
  value: [{ content: '<p>Teste</p>', image: paths.map((path) => ({ path })) }],
  settings: { __type: 'instagram', post_type: 'post', ...settings },
});
const makeBody = (posts = [makePost()], type = 'schedule') => ({
  type,
  shortLink: false,
  date: '2026-11-12T12:00:00.000Z',
  tags: [] as Array<{ value: string; label: string }>,
  posts,
});

describe('X Articles nos consumidores de posts', () => {
  let repo: ReturnType<typeof createMock<PostsRepository>>;
  let integrations: ReturnType<typeof createMock<IntegrationService>>;
  let service: PostsService;
  let workflow: jest.SpyInstance;

  beforeEach(() => {
    repo = createMock<PostsRepository>();
    integrations = createMock<IntegrationService>();
    integrations.getIntegrationById.mockResolvedValue({
      id: 'int-1',
      providerIdentifier: 'instagram',
    } as any);
    repo.createOrUpdatePost.mockResolvedValue({
      posts: [{ id: 'post-1', state: 'QUEUE' }],
    } as any);
    service = new PostsService(
      repo,
      null as any,
      integrations,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      {} as any,
      {} as any
    );
    workflow = jest
      .spyOn(service as any, 'startWorkflow')
      .mockResolvedValue(undefined);
  });

  const article = {
    __type: 'x',
    post_type: 'article',
    article_title: 'Titulo',
    article_status: 'published',
  };
  it('aceita artigo longo pelo contrato comum a API e edicao MCP', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      providerIdentifier: 'x',
    } as any);
    const post = makePost(article, []);
    post.value[0].content = '<p>' + 'a'.repeat(10000) + '</p>';
    const result = await service.mapTypeToPost(
      makeBody([post]) as any,
      'org-1'
    );
    expect(result.posts[0].value[0].content).toHaveLength(10007);
  });
  it.each(['zernio-twitter', 'facebook'])(
    'recusa artigo com __type forjado no provider real %s',
    async (providerIdentifier) => {
      integrations.getIntegrationById.mockResolvedValue({
        providerIdentifier,
      } as any);
      await expect(
        service.createPost(
          'org-1',
          makeBody([makePost(article, [])]) as any,
          'profile-1'
        )
      ).rejects.toThrow(/nativa/);
      expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
      expect(workflow).not.toHaveBeenCalled();
    }
  );
  it('recusa draft no X com respostas antes de persistir', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      providerIdentifier: 'x',
    } as any);
    const post = makePost({ ...article, article_status: 'draft' }, []);
    post.value.push({ content: 'Resposta', image: [] });
    await expect(
      service.createPost('org-1', makeBody([post]) as any, 'profile-1')
    ).rejects.toThrow(/respostas/);
    expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
  });
  it('recusa videos e titulo ausente antes do workflow', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      providerIdentifier: 'x',
    } as any);
    for (const post of [
      makePost(article, ['a.mp4']),
      makePost({ ...article, article_title: '' }, []),
    ])
      await expect(
        service.createPost('org-1', makeBody([post]) as any, 'profile-1')
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(workflow).not.toHaveBeenCalled();
  });
  it('changeDate valida chain salva antes de agendar draft de artigo com respostas', async () => {
    const settings = JSON.stringify({ ...article, article_status: 'draft' });
    repo.getPostById.mockResolvedValue({
      id: 'post-1',
      group: 'group',
      state: 'DRAFT',
      settings,
      integration: { id: 'int-1', providerIdentifier: 'x' },
    } as any);
    repo.getPostsByGroup.mockResolvedValue([
      { id: 'post-1', settings, content: 'Corpo', image: '[]' },
      { id: 'post-2', settings, content: 'Resposta', image: '[]' },
    ] as any);
    repo.getPost.mockImplementation(
      async (id) =>
        ({
          id,
          settings,
          content: id === 'post-1' ? 'Corpo' : 'Resposta',
          image: '[]',
          childrenPost: id === 'post-1' ? [{ id: 'post-2' }] : [],
        } as any)
    );
    await expect(
      service.changeDate(
        'org-1',
        'post-1',
        '2026-11-12T12:00:00.000Z',
        'schedule'
      )
    ).rejects.toThrow(/respostas/);
    expect(repo.changeDate).not.toHaveBeenCalled();
    expect(workflow).not.toHaveBeenCalled();
  });
  it('calendario usa ordem da cadeia e aceita corpo longo com resposta curta', async () => {
    const settings = JSON.stringify(article);
    const seed = {
      id: 'post-1',
      settings,
      content: 'a'.repeat(10000),
      image: '[]',
      childrenPost: [{ id: 'post-2' }],
    };
    const reply = {
      id: 'post-2',
      settings,
      content: 'Resposta',
      image: '[]',
      childrenPost: [],
    };
    repo.getPostById.mockResolvedValue({
      ...seed,
      group: 'group',
      state: 'DRAFT',
      integration: { id: 'int-1', providerIdentifier: 'x' },
    } as any);
    repo.getPostsByGroup.mockResolvedValue([reply, seed] as any);
    repo.getPost.mockImplementation(
      async (id) => (id === 'post-1' ? seed : reply) as any
    );
    await service.changeDate(
      'org-1',
      'post-1',
      '2026-11-12T12:00:00.000Z',
      'schedule'
    );
    expect(repo.changeDate).toHaveBeenCalledTimes(1);
    expect(repo.getPost).toHaveBeenCalledWith('post-1', false, 'org-1', true);
  });
  it('calendario recusa artigo em draft do provider alternativo antes de enfileirar', async () => {
    repo.getPostById.mockResolvedValue({
      id: 'post-1',
      state: 'DRAFT',
      settings: JSON.stringify(article),
      integration: { providerIdentifier: 'zernio-twitter' },
    } as any);
    await expect(
      service.changeDate(
        'org-1',
        'post-1',
        '2026-11-12T12:00:00.000Z',
        'schedule'
      )
    ).rejects.toThrow(/nativa/);
    expect(workflow).not.toHaveBeenCalled();
  });
});
