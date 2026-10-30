jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);
import { HttpException } from '@nestjs/common';
import { ReviewLinksService } from './review-links.service';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const build = (
  opts: {
    post?: {
      id: string;
      organizationId: string;
      profileId: string | null;
    } | null;
    linkScope?: { id: string; post: { profileId: string | null } } | null;
    revokeCount?: number;
  } = {}
) => {
  const repository = {
    assertPostOwnedByOrg: jest
      .fn()
      .mockResolvedValue(
        opts.post === undefined
          ? { id: 'post-1', organizationId: 'org-1', profileId: 'prof-2' }
          : opts.post
      ),
    createReviewLink: jest.fn().mockResolvedValue({
      id: 'link-1',
      allowComment: true,
      allowApprove: true,
      expiresAt: new Date(),
      createdAt: new Date(),
    }),
    listForPost: jest.fn().mockResolvedValue([{ id: 'link-1' }]),
    findLinkPostScope: jest
      .fn()
      .mockResolvedValue(
        opts.linkScope === undefined
          ? { id: 'link-1', post: { profileId: 'prof-2' } }
          : opts.linkScope
      ),
    revoke: jest.fn().mockResolvedValue({ count: opts.revokeCount ?? 1 }),
    findActiveByHashAndPost: jest
      .fn()
      .mockResolvedValue({
        id: 'link-1',
        postId: 'post-1',
        organizationId: 'org-1',
        allowComment: true,
        allowApprove: true,
      }),
    createGuestComment: jest
      .fn()
      .mockResolvedValue({
        id: 'comment-1',
        kind: 'COMMENT',
        createdAt: new Date('2026-10-29T12:00:00Z'),
      }),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
  };
  const postsService = { resolvePreviewPlacement: jest.fn() };
  return {
    service: new ReviewLinksService(repository as any, postsService as any),
    repository,
    postsService,
  };
};

const statusOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(HttpException);
  return (error as HttpException).getStatus();
};

const create = (requireProfileId?: string | null) => ({
  postId: 'post-1',
  orgId: 'org-1',
  userId: 'user-1',
  requireProfileId,
});

// Links de revisao expoem o post a convidados: membro USER so cria/lista/revoga
// nos posts do proprio perfil (mesma regra dos comentarios do post).
describe('ReviewLinksService (escopo por perfil)', () => {
  it('createForPost: USER de outro perfil -> 403 e nao cria', async () => {
    const { service, repository } = build();
    expect(await statusOf(service.createForPost(create('prof-1')))).toBe(403);
    expect(repository.createReviewLink).not.toHaveBeenCalled();
  });

  it('createForPost: mesmo perfil e admin criam; post inexistente -> 404', async () => {
    const { service, repository } = build();
    await service.createForPost(create('prof-2'));
    await service.createForPost(create(undefined));
    expect(repository.createReviewLink).toHaveBeenCalledTimes(2);

    const missing = build({ post: null });
    expect(
      await statusOf(missing.service.createForPost(create(undefined)))
    ).toBe(404);
  });

  it('listForPost confere o post antes de listar', async () => {
    const { service, repository } = build();
    expect(
      await statusOf(service.listForPost('post-1', 'org-1', 'prof-1'))
    ).toBe(403);
    expect(repository.listForPost).not.toHaveBeenCalled();

    await expect(
      service.listForPost('post-1', 'org-1', 'prof-2')
    ).resolves.toEqual([{ id: 'link-1' }]);
    await expect(service.listForPost('post-1', 'org-1')).resolves.toHaveLength(
      1
    );

    const missing = build({ post: null });
    expect(await statusOf(missing.service.listForPost('post-x', 'org-1'))).toBe(
      404
    );
  });

  it('revoke: USER deriva o perfil pelo post do link', async () => {
    const other = build();
    expect(
      await statusOf(other.service.revoke('link-1', 'org-1', 'prof-1'))
    ).toBe(403);
    expect(other.repository.revoke).not.toHaveBeenCalled();

    const unknown = build({ linkScope: null });
    expect(
      await statusOf(unknown.service.revoke('link-x', 'org-1', 'prof-1'))
    ).toBe(404);

    const same = build();
    await expect(
      same.service.revoke('link-1', 'org-1', 'prof-2')
    ).resolves.toEqual({
      success: true,
    });
  });

  it('revoke: admin revoga direto; link inexistente ou ja revogado -> 404', async () => {
    const admin = build();
    await admin.service.revoke('link-1', 'org-1');
    expect(admin.repository.findLinkPostScope).not.toHaveBeenCalled();
    expect(admin.repository.revoke).toHaveBeenCalledWith('link-1', 'org-1');

    const gone = build({ revokeCount: 0 });
    expect(await statusOf(gone.service.revoke('link-1', 'org-1'))).toBe(404);
  });
});

describe('ReviewLinksService - placement de convidado', () => {
  const params = {
    postId: 'post-1',
    rawToken: 'a'.repeat(32),
    ip: '127.0.0.1',
    userAgent: 'review-browser',
    guestName: '<b>Cliente</b>',
    guestEmail: 'CLIENTE@example.com',
    content: '<b>Ajustar</b>',
    kind: 'COMMENT' as const,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    (ioRedis.incr as jest.Mock).mockResolvedValue(1);
  });
  it('usa org do link ao validar resposta e grava no item validado', async () => {
    const { service, repository, postsService } = build();
    postsService.resolvePreviewPlacement.mockResolvedValue({
      postId: 'post-child',
      parentId: 'parent',
    });
    const result = await service.submitGuestAction({
      ...params,
      placement: { parentId: 'parent' },
    });
    expect(postsService.resolvePreviewPlacement).toHaveBeenCalledWith(
      'post-1',
      { parentId: 'parent' },
      'org-1'
    );
    expect(repository.createGuestComment).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        postId: 'post-child',
        parentId: 'parent',
        reviewLinkId: 'link-1',
        content: 'Ajustar',
        guestName: 'Cliente',
        guestEmail: 'cliente@example.com',
      })
    );
    expect(result).toEqual({
      id: 'comment-1',
      kind: 'COMMENT',
      createdAt: new Date('2026-10-29T12:00:00Z'),
    });
  });
  it('nao grava quando placement aponta fora da thread do link', async () => {
    const { service, repository, postsService } = build();
    postsService.resolvePreviewPlacement.mockRejectedValue(
      new HttpException('Post is outside preview', 400)
    );
    await expect(
      service.submitGuestAction({ ...params, placement: { postId: 'foreign' } })
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.createGuestComment).not.toHaveBeenCalled();
    expect(repository.touchLastUsed).not.toHaveBeenCalled();
  });
  it.each(['APPROVAL', 'CHANGE_REQUEST'] as const)(
    'decisao %s nao pode usar ancora ou resposta',
    async (kind) => {
      const { service, repository, postsService } = build();
      await expect(
        service.submitGuestAction({
          ...params,
          kind,
          placement: { parentId: 'parent' },
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(postsService.resolvePreviewPlacement).not.toHaveBeenCalled();
      expect(repository.createGuestComment).not.toHaveBeenCalled();
    }
  );
  it('decisao sem placement permanece no post do link', async () => {
    const { service, repository, postsService } = build();
    await service.submitGuestAction({
      ...params,
      kind: 'APPROVAL',
      content: '',
    });
    expect(postsService.resolvePreviewPlacement).not.toHaveBeenCalled();
    expect(repository.createGuestComment).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'post-1',
        organizationId: 'org-1',
        kind: 'APPROVAL',
        content: '',
      })
    );
  });
  it('limite de convidado bloqueia antes de buscar link', async () => {
    const { service, repository } = build();
    (ioRedis.incr as jest.Mock).mockResolvedValueOnce(11);
    await expect(service.submitGuestAction(params)).rejects.toMatchObject({
      status: 429,
    });
    expect(repository.findActiveByHashAndPost).not.toHaveBeenCalled();
    expect(repository.createGuestComment).not.toHaveBeenCalled();
  });
});
