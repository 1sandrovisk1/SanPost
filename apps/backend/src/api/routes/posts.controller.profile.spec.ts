jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkServiceMock {},
}));
jest.mock('@gitroom/nestjs-libraries/agent/agent.graph.service', () => ({
  AgentGraphService: class AgentGraphServiceMock {},
}));

import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { PostsController } from './posts.controller';

const build = () => {
  const postsService = createMock<PostsService>();
  const reviewLinksService = {
    createForPost: jest.fn(),
    listForPost: jest.fn().mockResolvedValue([]),
    revoke: jest.fn(),
  };
  const controller = new PostsController(
    postsService,
    null as any,
    null as any,
    reviewLinksService as any
  );
  return { controller, postsService, reviewLinksService };
};
const org = { id: 'org-1' } as any;
const profile = { id: 'prof-1' } as any;

// Leituras/escritas por id passam o perfil resolvido ao service (escopo por
// perfil) — posicao do argumento pinada como em changeDate.
describe('PostsController - escopo por perfil nas rotas por id', () => {
  it('GET /:id e GET /group/:group repassam o perfil', async () => {
    const { controller, postsService } = build();
    await controller.getPost(org, profile, 'post-1');
    expect(postsService.getPost).toHaveBeenCalledWith('org-1', 'post-1', false, 'prof-1');
    await controller.getPostsByGroup(org, profile, 'g1');
    expect(postsService.getPostsByGroup).toHaveBeenCalledWith('org-1', 'g1', 'prof-1');
  });

  it('GET /:id/missing e PUT /:id/release-id repassam o perfil e o releaseId do DTO', async () => {
    const { controller, postsService } = build();
    await controller.getMissingContent(org, profile, 'post-1');
    expect(postsService.getMissingContent).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      false,
      'prof-1'
    );
    await controller.updateReleaseId(org, profile, 'post-1', { releaseId: '123' });
    expect(postsService.updateReleaseId).toHaveBeenCalledWith(
      'org-1',
      'post-1',
      '123',
      'prof-1'
    );
  });

  it('sem perfil resolvido repassa undefined', async () => {
    const { controller, postsService } = build();
    await controller.getPost(org, null, 'post-1');
    expect(postsService.getPost).toHaveBeenCalledWith('org-1', 'post-1', false, undefined);
  });
});

// statistics, review-links e /old: membro USER fica no proprio perfil (mesma
// regra de /:id/comments); admin/superadmin sem restricao.
describe('PostsController - escopo por perfil em statistics, review-links e /old', () => {
  const userOrg = { id: 'org-1', users: [{ role: 'USER' }] } as any;
  const adminOrg = { id: 'org-1', users: [{ role: 'ADMIN' }] } as any;
  const user = { id: 'user-1' } as any;

  it('GET /:id/statistics', async () => {
    const { controller, postsService } = build();
    await controller.getStatistics(userOrg, profile, 'post-1');
    expect(postsService.getStatistics).toHaveBeenLastCalledWith('org-1', 'post-1', 'prof-1');
    await controller.getStatistics(adminOrg, profile, 'post-1');
    expect(postsService.getStatistics).toHaveBeenLastCalledWith('org-1', 'post-1', undefined);
  });

  it('GET /old', async () => {
    const { controller, postsService } = build();
    await controller.oldPosts(userOrg, profile, '2026-10-26');
    expect(postsService.getOldPosts).toHaveBeenLastCalledWith('org-1', '2026-10-26', 'prof-1');
    await controller.oldPosts(adminOrg, profile, '2026-10-26');
    expect(postsService.getOldPosts).toHaveBeenLastCalledWith('org-1', '2026-10-26', undefined);
  });

  it('POST, GET e DELETE de review-links', async () => {
    const { controller, reviewLinksService } = build();
    await controller.createReviewLink(userOrg, user, profile, 'post-1', {});
    expect(reviewLinksService.createForPost).toHaveBeenLastCalledWith(
      expect.objectContaining({ postId: 'post-1', orgId: 'org-1', requireProfileId: 'prof-1' })
    );
    await controller.listReviewLinks(userOrg, profile, 'post-1');
    expect(reviewLinksService.listForPost).toHaveBeenLastCalledWith('post-1', 'org-1', 'prof-1');
    await controller.revokeReviewLink(userOrg, profile, 'link-1');
    expect(reviewLinksService.revoke).toHaveBeenLastCalledWith('link-1', 'org-1', 'prof-1');

    await controller.revokeReviewLink(adminOrg, profile, 'link-1');
    expect(reviewLinksService.revoke).toHaveBeenLastCalledWith('link-1', 'org-1', undefined);
  });
});
