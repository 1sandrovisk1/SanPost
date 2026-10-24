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

import { PostsService } from './posts.service';

const build = (urls: Array<{ id: string; releaseURL: string }>) => {
  const postRepository = { getPostUrls: jest.fn().mockResolvedValue(urls) };
  const service = new PostsService(
    postRepository as any,
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
  return { service, postRepository };
};

// CVE-2026-115932 (CWE-74): a release URL respondida pela plataforma era
// substituida no JSON inteiro dos posts — inclusive dentro da lista de midia.
describe('PostsService.updateTags - release URL so em content/settings', () => {
  it('substitui a tag no content e nos settings (escapado), nunca na midia', async () => {
    const { service } = build([
      { id: 'abc', releaseURL: 'https://x.com/p/1?q="a",https://x.com/p/2' },
    ]);
    const posts: any = [
      {
        id: 'p1',
        content: 'veja (post:abc) aqui',
        settings: JSON.stringify({ title: 'link (post:abc)' }),
        image: JSON.stringify([{ path: '/uploads/(post:abc)/../../etc/passwd' }]),
      },
    ];

    const [result] = await service.updateTags('org-1', posts);

    expect(result.content).toBe('veja https://x.com/p/1?q="a" aqui');
    expect(JSON.parse(result.settings)).toEqual({ title: 'link https://x.com/p/1?q="a"' });
    expect(result.image).toBe(posts[0].image);
  });

  it('devolve os posts intactos quando nao ha tag', async () => {
    const { service, postRepository } = build([]);
    const posts: any = [{ id: 'p1', content: 'sem tag', settings: '{}' }];

    await expect(service.updateTags('org-1', posts)).resolves.toBe(posts);
    expect(postRepository.getPostUrls).not.toHaveBeenCalled();
  });

  it('tag sem URL conhecida vira vazio e $ na URL nao e interpretado como padrao', async () => {
    const { service } = build([{ id: 'abc', releaseURL: 'https://x.com/$&/$1' }]);
    const posts: any = [
      { id: 'p1', content: '(post:abc) e (post:zzz)', settings: null },
    ];

    const [result] = await service.updateTags('org-1', posts);

    expect(result.content).toBe('https://x.com/$&/$1 e ');
    expect(result.settings).toBeNull();
  });
});
