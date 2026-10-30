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

describe('PostsService.createPost - extras sociais antes de persistir', () => {
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

  it('aceita audio em um MP4 do Instagram real e preserva volume zero', async () => {
    const post = makePost({ audio }, [
      'https://cdn.test/reel.MP4?token=public',
    ]);
    await service.createPost('org-1', makeBody([post]) as any, 'profile-1');
    expect(integrations.getIntegrationById).toHaveBeenCalledWith(
      'org-1',
      'int-1'
    );
    expect(repo.createOrUpdatePost).toHaveBeenCalledTimes(1);
    expect(repo.createOrUpdatePost.mock.calls[0][3].settings).toEqual(
      expect.objectContaining({ audio })
    );
    expect(workflow).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['standalone', 'instagram-standalone', 'post', ['reel.mp4']],
    ['Zernio', 'zernio-instagram', 'post', ['reel.mp4']],
    ['outro provider com __type forjado', 'facebook', 'post', ['reel.mp4']],
    ['story', 'instagram', 'story', ['reel.mp4']],
    ['foto', 'instagram', 'post', ['foto.jpg']],
    ['carrossel', 'instagram', 'post', ['reel.mp4', 'outro.mp4']],
    ['sem midia', 'instagram', 'post', []],
    ['video que nao e MP4', 'instagram', 'post', ['reel.webm']],
  ])(
    'recusa audio em %s sem gravar ou enfileirar',
    async (_, providerIdentifier, post_type, paths) => {
      integrations.getIntegrationById.mockResolvedValue({
        providerIdentifier,
      } as any);
      await expect(
        service.createPost(
          'org-1',
          makeBody([makePost({ audio, post_type }, paths as string[])]) as any,
          'profile-1'
        )
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
      expect(workflow).not.toHaveBeenCalled();
    }
  );

  it.each(['now', 'schedule', 'update'])(
    'valida o lote inteiro antes da primeira escrita em %s',
    async (type) => {
      const body = makeBody(
        [
          makePost({}, ['reel.mp4'], 'valid-channel'),
          makePost({ audio }, ['foto.jpg'], 'invalid-channel'),
        ],
        type
      );
      await expect(
        service.createPost('org-1', body as any, 'profile-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
      expect(workflow).not.toHaveBeenCalled();
      expect(integrations.getIntegrationById).toHaveBeenCalledTimes(1);
      expect(integrations.getIntegrationById).toHaveBeenCalledWith(
        'org-1',
        'invalid-channel'
      );
    }
  );

  it.each(['instagram', 'instagram-standalone', 'zernio-facebook'])(
    'recusa fundo Facebook em integracao real %s apesar do __type',
    async (providerIdentifier) => {
      integrations.getIntegrationById.mockResolvedValue({
        providerIdentifier,
      } as any);
      const post = makePost(
        { __type: 'facebook', text_format_preset_id: '106018623298955' },
        []
      );
      await expect(
        service.createPost('org-1', makeBody([post]) as any, 'profile-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
      expect(workflow).not.toHaveBeenCalled();
    }
  );

  it('aceita fundo para integracao real Facebook', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      providerIdentifier: 'facebook',
    } as any);
    const post = makePost(
      { __type: 'facebook', text_format_preset_id: '106018623298955' },
      []
    );
    await service.createPost('org-1', makeBody([post]) as any, 'profile-1');
    expect(integrations.getIntegrationById).toHaveBeenCalledWith(
      'org-1',
      'int-1'
    );
    expect(repo.createOrUpdatePost.mock.calls[0][3].settings).toEqual(
      expect.objectContaining({ text_format_preset_id: '106018623298955' })
    );
  });

  it('rascunho preserva selecoes ainda incompativeis sem consultar provider', async () => {
    const post = makePost(
      { audio, post_type: 'story', text_format_preset_id: '106018623298955' },
      ['foto.jpg']
    );
    const settings = { ...post.settings };
    await service.createPost(
      'org-1',
      makeBody([post], 'draft') as any,
      'profile-1'
    );
    expect(repo.createOrUpdatePost.mock.calls[0][3].settings).toEqual(settings);
    expect(integrations.getIntegrationById).not.toHaveBeenCalled();
  });

  it('nao consulta provider para posts sem extras', async () => {
    await service.createPost(
      'org-1',
      makeBody([makePost({})]) as any,
      'profile-1'
    );
    expect(repo.createOrUpdatePost).toHaveBeenCalledTimes(1);
    expect(integrations.getIntegrationById).not.toHaveBeenCalled();
  });

  it('recusa thread do Tumblr antes de gravar mesmo com __type forjado', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      providerIdentifier: 'tumblr',
    } as any);
    const post = makePost({ __type: 'facebook' });
    post.value.push({ content: 'Segundo bloco', image: [] });
    await expect(
      service.createPost('org-1', makeBody([post]) as any, 'profile-1')
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.createOrUpdatePost).not.toHaveBeenCalled();
    expect(workflow).not.toHaveBeenCalled();
  });

  it('preserva threads de outros canais', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      providerIdentifier: 'facebook',
    } as any);
    const post = makePost({});
    post.value.push({ content: 'Segundo bloco', image: [] });
    await service.createPost('org-1', makeBody([post]) as any, 'profile-1');
    expect(repo.createOrUpdatePost).toHaveBeenCalledTimes(1);
  });

  it('mapTypeToPost bloqueia thread Tumblr para o contrato usado por edicao e acoes MCP', async () => {
    integrations.getIntegrationById.mockResolvedValue({
      providerIdentifier: 'tumblr',
    } as any);
    const post = makePost({ __type: 'tumblr' }, []);
    const body: any = makeBody([post]);
    body.posts[0].value[0].delay = 0;
    await expect(service.mapTypeToPost(body, 'org-1')).resolves.toBeDefined();
    post.value.push({ content: 'Segundo bloco', image: [], delay: 0 } as any);
    await expect(service.mapTypeToPost(body, 'org-1')).rejects.toThrow(
      /Tumblr/
    );
    body.type = 'draft';
    await expect(service.mapTypeToPost(body, 'org-1')).resolves.toBeDefined();
  });

  it('changeDate recusa agendar draft Tumblr com varios blocos antes da escrita', async () => {
    repo.getPostById.mockResolvedValue({
      id: 'post-1',
      group: 'group-1',
      state: 'DRAFT',
      profileId: 'profile-1',
      integration: { id: 'int-1', providerIdentifier: 'tumblr' },
    } as any);
    repo.getPostsByGroup.mockResolvedValue([
      { id: 'post-1' },
      { id: 'post-2' },
    ] as any);
    await expect(
      service.changeDate(
        'org-1',
        'post-1',
        '2026-11-12T12:00:00.000Z',
        'schedule',
        'profile-1'
      )
    ).rejects.toThrow(/Tumblr/);
    expect(repo.changeDate).not.toHaveBeenCalled();
    expect(workflow).not.toHaveBeenCalled();
  });

  it('changeDate permite agendar Tumblr de um bloco', async () => {
    repo.getPostById.mockResolvedValue({
      id: 'post-1',
      group: 'group-1',
      state: 'DRAFT',
      profileId: 'profile-1',
      integration: { id: 'int-1', providerIdentifier: 'tumblr' },
    } as any);
    repo.getPostsByGroup.mockResolvedValue([{ id: 'post-1' }] as any);
    await service.changeDate(
      'org-1',
      'post-1',
      '2026-11-12T12:00:00.000Z',
      'schedule',
      'profile-1'
    );
    expect(repo.changeDate).toHaveBeenCalledTimes(1);
    expect(workflow).toHaveBeenCalledTimes(1);
  });
});
