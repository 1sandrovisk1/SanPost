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
jest.mock('@gitroom/nestjs-libraries/agent/agent.graph.insert.service', () => ({
  AgentGraphInsertService: class AgentGraphInsertServiceMock {},
}));

import { PublicController } from './public.controller';

// Preview publico (sem auth): nunca Post.error (excecao crua do provider) nem
// token do canal — mesma classe da CVE-2026-107761.
describe('PublicController.getPreview', () => {
  it('devolve o post sem error/childrenPost e a integracao projetada', async () => {
    const postsService = {
      getPostsRecursively: jest.fn().mockResolvedValue([
        {
          id: 'p1',
          content: 'oi',
          image: '[]',
          publishDate: new Date('2026-10-26T10:00:00Z'),
          state: 'PUBLISHED',
          group: 'g-secret',
          organizationId: 'org-1',
          profileId: 'prof-1',
          settings: '{"board":"1"}',
          error: '{"refresh_token":"S"}',
          childrenPost: [{ id: 'c1', error: 'x' }],
          integration: {
            id: 'i1',
            name: 'Canal',
            picture: 'p.png',
            providerIdentifier: 'x',
            profile: 'handle',
            token: 'TOKEN',
          },
        },
      ]),
    };
    const controller = new PublicController(
      null as any,
      null as any,
      postsService as any,
      null as any,
      null as any,
      null as any
    );

    const [post] = await controller.getPreview('p1');
    expect(Object.keys(post).sort()).toEqual(
      ['content', 'delay', 'id', 'image', 'integration', 'publishDate', 'releaseURL', 'state'].sort()
    );
    expect(post).not.toHaveProperty('error');
    expect(post).not.toHaveProperty('childrenPost');
    expect(JSON.stringify(post)).not.toMatch(/g-secret|org-1|prof-1|board/);
    expect(post.integration).toEqual({
      id: 'i1',
      name: 'Canal',
      picture: 'p.png',
      providerIdentifier: 'x',
      profile: 'handle',
    });
    expect(JSON.stringify(post)).not.toMatch(/TOKEN|refresh_token/);
  });
});
