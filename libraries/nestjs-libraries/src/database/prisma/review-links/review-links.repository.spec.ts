import { ReviewLinksRepository } from './review-links.repository';

const build = () => {
  const post = { findFirst: jest.fn().mockResolvedValue(null) };
  const reviewLink = { findFirst: jest.fn().mockResolvedValue(null) };
  const repo = new ReviewLinksRepository(
    { model: { reviewLink } } as any,
    { model: { comments: {} } } as any,
    { model: { post } } as any
  );
  return { repo, post, reviewLink };
};

describe('ReviewLinksRepository (escopo por perfil)', () => {
  it('assertPostOwnedByOrg devolve tambem o perfil do post', async () => {
    const { repo, post } = build();
    await repo.assertPostOwnedByOrg('post-1', 'org-1');
    const arg = post.findFirst.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'post-1', organizationId: 'org-1', deletedAt: null });
    expect(arg.select).toEqual({ id: true, organizationId: true, profileId: true });
  });

  it('findLinkPostScope busca o link da org com o perfil do post', async () => {
    const { repo, reviewLink } = build();
    await repo.findLinkPostScope('link-1', 'org-1');
    const arg = reviewLink.findFirst.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'link-1', organizationId: 'org-1' });
    expect(arg.select).toEqual({ id: true, post: { select: { profileId: true } } });
  });
});
