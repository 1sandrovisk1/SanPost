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
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { incr: jest.fn().mockResolvedValue(1), expire: jest.fn() },
}));
import { PostsService } from './posts.service';
import { PostsRepository } from './posts.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const thread = [
  {
    id: 'root',
    organizationId: 'org',
    profileId: 'profile',
    content: '<p>Hello &amp; world</p>',
  },
  {
    id: 'child',
    organizationId: 'org',
    profileId: 'profile',
    content: '<p>Second</p>',
  },
];
describe('comentarios no preview', () => {
  const oldEnv = process.env;
  let repo: ReturnType<typeof createMock<PostsRepository>>;
  let service: PostsService;
  beforeEach(() => {
    process.env = {
      ...oldEnv,
      RECAPTCHA_SITE_KEY: 'site',
      RECAPTCHA_SECRET_KEY: 'secret',
      FRONTEND_URL: 'https://app.example.com',
    };
    repo = createMock<PostsRepository>();
    service = new PostsService(
      repo as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      {} as any,
      {} as any
    );
    jest.spyOn(service, 'getPostsRecursively').mockResolvedValue(thread as any);
    repo.getPostProfileScope.mockResolvedValue({
      id: 'root',
      profileId: 'profile',
    } as any);
  });
  afterEach(() => {
    process.env = oldEnv;
    jest.restoreAllMocks();
  });
  it('vincula comentario ao item correto e valida o texto selecionado', async () => {
    expect(
      await service.resolvePreviewPlacement(
        'root',
        {
          postId: 'child',
          anchorStart: 0,
          anchorEnd: 6,
          anchorQuote: 'Second',
        },
        'org'
      )
    ).toMatchObject({ postId: 'child', anchorQuote: 'Second' });
    await expect(
      service.resolvePreviewPlacement('root', { postId: 'other' }, 'org')
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.resolvePreviewPlacement(
        'root',
        { anchorStart: 0, anchorEnd: 5, anchorQuote: 'wrong' },
        'org'
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.resolvePreviewPlacement(
        'root',
        { anchorStart: 0.5, anchorEnd: 5, anchorQuote: 'Hello' },
        'org'
      )
    ).rejects.toMatchObject({ status: 400 });
  });
  it('recusa resposta de outro post, subresposta e conversa resolvida', async () => {
    const parents: Array<{
      postId: string;
      parentId: string | null;
      resolvedAt: Date | null;
    }> = [
      { postId: 'foreign', parentId: null, resolvedAt: null },
      { postId: 'root', parentId: 'nested', resolvedAt: null },
      { postId: 'root', parentId: null, resolvedAt: new Date() },
    ];
    for (const parent of parents) {
      repo.getCommentForReply.mockResolvedValue(parent as any);
      await expect(
        service.resolvePreviewPlacement('root', { parentId: 'c' }, 'org')
      ).rejects.toMatchObject({ status: 400 });
    }
  });
  it('remove identidade e metadados privados da resposta publica', async () => {
    repo.getComments.mockResolvedValue([
      {
        id: 'c',
        postId: 'root',
        userId: 'secret-user',
        guestEmail: 'private@email',
        guestIp: 'ip',
        reviewLinkId: null,
        kind: 'COMMENT',
        content: 'x',
        createdAt: new Date(),
        parentId: null,
        anchorStart: null,
        anchorEnd: null,
        anchorQuote: null,
        resolvedAt: null,
      },
    ] as any);
    const comments = await service.getComments('root');
    expect(comments[0]).toMatchObject({ author: 'member', memberIndex: 1 });
    expect(JSON.stringify(comments)).not.toMatch(
      /secret-user|private@email|guestIp|organizationId/
    );
    expect(repo.getComments).toHaveBeenCalledWith(['root', 'child']);
  });
  it('sem captcha configurado nao aceita escrita publica', async () => {
    delete process.env.RECAPTCHA_SECRET_KEY;
    await expect(
      service.createAnonymousComment(
        'root',
        { content: 'hi', displayName: 'A', recaptchaToken: 't' },
        '127.0.0.1',
        null
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.createComment).not.toHaveBeenCalled();
  });
  it('captcha e hostname invalidos impedem gravacao', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, hostname: 'evil.example' }),
      } as any);
    await expect(
      service.createAnonymousComment(
        'root',
        { content: 'hi', displayName: 'A', recaptchaToken: 't' },
        '127.0.0.1',
        null
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.createComment).not.toHaveBeenCalled();
  });
  it('captcha valido grava comentario sem usuario e sem dar aprovacao', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, hostname: 'app.example.com' }),
      } as any);
    await service.createAnonymousComment(
      'root',
      { content: '<b>hi</b>', displayName: '<b>A</b>', recaptchaToken: 't' },
      '127.0.0.1',
      null
    );
    expect(repo.createComment).toHaveBeenCalledWith(
      'org',
      null,
      'root',
      'hi',
      'COMMENT',
      expect.objectContaining({ guestName: 'A' })
    );
  });
  it('Redis indisponivel falha fechado antes de consultar captcha', async () => {
    (ioRedis.incr as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      service.createAnonymousComment(
        'root',
        { content: 'hi', displayName: 'A', recaptchaToken: 't' },
        '127.0.0.1',
        null
      )
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('resolver e excluir exigem perfil do post e raiz da thread', async () => {
    repo.getCommentScope.mockResolvedValue({
      id: 'c',
      parentId: null,
      kind: 'COMMENT',
      post: { profileId: 'other', deletedAt: null },
    } as any);
    await expect(
      service.resolveComment('org', 'root', 'c', true, 'profile')
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.setCommentResolved).not.toHaveBeenCalled();
  });
  it('resposta valida herda o item do comentario raiz', async () => {
    repo.getCommentForReply.mockResolvedValue({
      id: 'parent',
      postId: 'child',
      parentId: null,
      resolvedAt: null,
      kind: 'COMMENT',
    } as any);
    await expect(
      service.resolvePreviewPlacement('root', { parentId: 'parent' }, 'org')
    ).resolves.toEqual({ postId: 'child', parentId: 'parent' });
    await expect(
      service.resolvePreviewPlacement(
        'root',
        { parentId: 'parent', postId: 'root' },
        'org'
      )
    ).rejects.toMatchObject({ status: 400 });
  });
  it('resposta nao pode criar novo destaque nem responder a aprovacao', async () => {
    repo.getCommentForReply.mockResolvedValue({
      id: 'parent',
      postId: 'root',
      parentId: null,
      resolvedAt: null,
      kind: 'APPROVAL',
    } as any);
    await expect(
      service.resolvePreviewPlacement('root', { parentId: 'parent' }, 'org')
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.resolvePreviewPlacement(
        'root',
        {
          parentId: 'parent',
          anchorStart: 0,
          anchorEnd: 5,
          anchorQuote: 'Hello',
        },
        'org'
      )
    ).rejects.toMatchObject({ status: 400 });
  });
  it('texto de entidades usa os offsets visiveis do preview', async () => {
    await expect(
      service.resolvePreviewPlacement(
        'root',
        { anchorStart: 6, anchorEnd: 7, anchorQuote: '&' },
        'org'
      )
    ).resolves.toMatchObject({
      anchorStart: 6,
      anchorEnd: 7,
      anchorQuote: '&',
    });
  });
  it('limite por IP vale mesmo ao alternar entre posts', async () => {
    (ioRedis.incr as jest.Mock).mockResolvedValueOnce(21);
    const request = jest.spyOn(global, 'fetch');
    await expect(
      service.createAnonymousComment(
        'root',
        { content: 'x', displayName: 'Visitante', recaptchaToken: 't' },
        '127.0.0.1',
        null
      )
    ).rejects.toMatchObject({ status: 429 });
    expect(request).not.toHaveBeenCalled();
    expect(repo.createComment).not.toHaveBeenCalled();
  });
  it('limite do post impede captcha e gravacao antes do limite global', async () => {
    (ioRedis.incr as jest.Mock)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(11);
    const request = jest.spyOn(global, 'fetch');
    await expect(
      service.createAnonymousComment(
        'root',
        { content: 'x', displayName: 'Visitante', recaptchaToken: 't' },
        '127.0.0.1',
        null
      )
    ).rejects.toMatchObject({ status: 429 });
    expect(request).not.toHaveBeenCalled();
    expect(repo.createComment).not.toHaveBeenCalled();
  });
  it('post ausente nao aceita comentario anonimo', async () => {
    jest.mocked(service.getPostsRecursively).mockResolvedValue([]);
    const request = jest.spyOn(global, 'fetch');
    await expect(
      service.createAnonymousComment(
        'missing',
        { content: 'x', displayName: 'Visitante', recaptchaToken: 't' },
        '127.0.0.1',
        null
      )
    ).rejects.toMatchObject({ status: 404 });
    expect(request).not.toHaveBeenCalled();
    expect(repo.createComment).not.toHaveBeenCalled();
  });
  it('resolver e reabrir preservam escopo de org e perfil', async () => {
    repo.getCommentScope.mockResolvedValue({
      id: 'c',
      postId: 'child',
      parentId: null,
      kind: 'COMMENT',
      post: { profileId: 'profile', deletedAt: null },
    } as any);
    await expect(
      service.resolveComment('org', 'root', 'c', true, 'profile')
    ).resolves.toEqual({ success: true });
    expect(repo.setCommentResolved).toHaveBeenLastCalledWith(
      'c',
      'org',
      expect.any(Date)
    );
    await service.resolveComment('org', 'root', 'c', false, 'profile');
    expect(repo.setCommentResolved).toHaveBeenLastCalledWith('c', 'org', null);
    expect(repo.getCommentScope).toHaveBeenCalledWith('c', 'org');
  });
  it.each([
    {
      postId: 'foreign',
      parentId: null,
      kind: 'COMMENT',
      post: { profileId: 'profile', deletedAt: null },
    },
    {
      postId: 'root',
      parentId: null,
      kind: 'COMMENT',
      post: { profileId: 'profile', deletedAt: new Date() },
    },
  ])(
    'moderacao nao alcanca comentario fora do preview ou de post excluido',
    async (comment) => {
      repo.getCommentScope.mockResolvedValue({ id: 'c', ...comment } as any);
      await expect(
        service.resolveComment('org', 'root', 'c', true, 'profile')
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.deletePreviewComment('org', 'root', 'c', 'profile')
      ).rejects.toMatchObject({ status: 404 });
      expect(repo.setCommentResolved).not.toHaveBeenCalled();
      expect(repo.softDeleteComment).not.toHaveBeenCalled();
    }
  );
  it('excluir rejeita outro perfil e comentario inexistente', async () => {
    repo.getCommentScope.mockResolvedValue({
      id: 'c',
      postId: 'root',
      parentId: null,
      kind: 'COMMENT',
      post: { profileId: 'other', deletedAt: null },
    } as any);
    await expect(
      service.deletePreviewComment('org', 'root', 'c', 'profile')
    ).rejects.toMatchObject({ status: 403 });
    repo.getCommentScope.mockResolvedValue(null);
    await expect(
      service.deletePreviewComment('org', 'root', 'c', 'profile')
    ).rejects.toMatchObject({ status: 404 });
    expect(repo.softDeleteComment).not.toHaveBeenCalled();
  });
  it.each([
    { parentId: 'parent', kind: 'COMMENT' },
    { parentId: null, kind: 'APPROVAL' },
  ])('apenas raiz de conversa COMMENT pode ser resolvida', async (comment) => {
    repo.getCommentScope.mockResolvedValue({
      id: 'c',
      postId: 'root',
      post: { profileId: 'profile', deletedAt: null },
      ...comment,
    } as any);
    await expect(
      service.resolveComment('org', 'root', 'c', true, 'profile')
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.setCommentResolved).not.toHaveBeenCalled();
  });
  it('exclusao valida delega apenas comentario da org', async () => {
    repo.getCommentScope.mockResolvedValue({
      id: 'c',
      postId: 'child',
      parentId: null,
      kind: 'COMMENT',
      post: { profileId: 'profile', deletedAt: null },
    } as any);
    await expect(
      service.deletePreviewComment('org', 'root', 'c', 'profile')
    ).resolves.toEqual({ success: true });
    expect(repo.softDeleteComment).toHaveBeenCalledWith('c', 'org');
  });
});
