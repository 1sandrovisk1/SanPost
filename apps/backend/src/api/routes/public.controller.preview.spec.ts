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
      [
        'content',
        'delay',
        'id',
        'image',
        'integration',
        'publishDate',
        'releaseURL',
        'state',
      ].sort()
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

describe('PublicController - comentarios no preview', () => {
  const oldEnv = process.env;
  afterEach(() => {
    process.env = oldEnv;
  });
  const buildComments = () => {
    const posts = {
      getComments: jest
        .fn()
        .mockResolvedValue([
          {
            id: 'c',
            author: 'member',
            memberIndex: 1,
            name: null,
            content: 'Nota',
          },
        ]),
      createAnonymousComment: jest
        .fn()
        .mockResolvedValue({ id: 'new', kind: 'COMMENT' }),
    };
    const links = {
      submitGuestAction: jest
        .fn()
        .mockResolvedValue({ id: 'guest', kind: 'COMMENT' }),
    };
    const controller = new PublicController(
      null as any,
      null as any,
      posts as any,
      null as any,
      null as any,
      links as any
    );
    return { controller, posts, links };
  };
  it('informa somente site key publica quando a escrita anonima esta configurada', async () => {
    process.env = {
      ...oldEnv,
      RECAPTCHA_SECRET_KEY: 'never-public-secret',
      RECAPTCHA_SITE_KEY: 'public-site',
      FRONTEND_URL: 'https://app.example.com',
    };
    const { controller, posts } = buildComments();
    const result = await controller.getComments('root');
    expect(result).toMatchObject({
      anonymousEnabled: true,
      recaptchaSiteKey: 'public-site',
      comments: [
        {
          id: 'c',
          author: 'member',
          memberIndex: 1,
          name: null,
          content: 'Nota',
        },
      ],
    });
    expect(posts.getComments).toHaveBeenCalledWith('root');
    expect(JSON.stringify(result)).not.toContain('never-public-secret');
  });
  it('sem secret nao anuncia escrita anonima nem fornece site key', async () => {
    process.env = {
      ...oldEnv,
      RECAPTCHA_SITE_KEY: 'public-site',
      FRONTEND_URL: 'https://app.example.com',
    };
    delete process.env.RECAPTCHA_SECRET_KEY;
    const { controller } = buildComments();
    expect(await controller.getComments('root')).toMatchObject({
      anonymousEnabled: false,
      recaptchaSiteKey: null,
    });
  });
  it('envio anonimo repassa placement sem criar tipo de aprovacao', async () => {
    const { controller, posts } = buildComments();
    const body = {
      displayName: 'Visitante',
      content: 'Nota',
      recaptchaToken: 'captcha',
      postId: 'child',
      parentId: 'parent',
    };
    await controller.createAnonymousComment(
      'root',
      body,
      '127.0.0.1',
      'review-browser'
    );
    expect(posts.createAnonymousComment).toHaveBeenCalledWith(
      'root',
      body,
      '127.0.0.1',
      'review-browser'
    );
  });
  it('convidado usa link e placement na mesma acao COMMENT', async () => {
    const { controller, links } = buildComments();
    const body = {
      token: 'private-review-token',
      guestName: 'Cliente',
      guestEmail: 'a@example.com',
      content: 'Nota',
      postId: 'child',
      anchorStart: 0,
      anchorEnd: 5,
      anchorQuote: 'Texto',
    };
    await controller.guestReviewComment(
      'root',
      '127.0.0.1',
      'review-browser',
      body
    );
    expect(links.submitGuestAction).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: 'root',
        rawToken: 'private-review-token',
        kind: 'COMMENT',
        placement: body,
      })
    );
  });
});
