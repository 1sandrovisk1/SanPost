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
  const controller = new PostsController(
    postsService,
    null as any,
    null as any,
    null as any
  );
  return { controller, postsService };
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
