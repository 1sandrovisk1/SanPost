import { HttpException } from '@nestjs/common';
import { ReviewLinksService } from './review-links.service';

const build = (opts: {
  post?: { id: string; organizationId: string; profileId: string | null } | null;
  linkScope?: { id: string; post: { profileId: string | null } } | null;
  revokeCount?: number;
} = {}) => {
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
  };
  return { service: new ReviewLinksService(repository as any), repository };
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
    expect(await statusOf(missing.service.createForPost(create(undefined)))).toBe(404);
  });

  it('listForPost confere o post antes de listar', async () => {
    const { service, repository } = build();
    expect(await statusOf(service.listForPost('post-1', 'org-1', 'prof-1'))).toBe(403);
    expect(repository.listForPost).not.toHaveBeenCalled();

    await expect(service.listForPost('post-1', 'org-1', 'prof-2')).resolves.toEqual([
      { id: 'link-1' },
    ]);
    await expect(service.listForPost('post-1', 'org-1')).resolves.toHaveLength(1);

    const missing = build({ post: null });
    expect(await statusOf(missing.service.listForPost('post-x', 'org-1'))).toBe(404);
  });

  it('revoke: USER deriva o perfil pelo post do link', async () => {
    const other = build();
    expect(await statusOf(other.service.revoke('link-1', 'org-1', 'prof-1'))).toBe(403);
    expect(other.repository.revoke).not.toHaveBeenCalled();

    const unknown = build({ linkScope: null });
    expect(await statusOf(unknown.service.revoke('link-x', 'org-1', 'prof-1'))).toBe(404);

    const same = build();
    await expect(same.service.revoke('link-1', 'org-1', 'prof-2')).resolves.toEqual({
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
