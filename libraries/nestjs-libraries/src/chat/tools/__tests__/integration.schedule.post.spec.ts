jest.mock('../../../integrations/integration.manager', () => ({
  socialIntegrationList: [{ identifier: 'instagram', maxLength: () => 2200 }],
}));
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
import { IntegrationSchedulePostTool } from '../integration.schedule.post';
describe('criacao MCP completa de posts', () => {
  const posts = {
    mapTypeToPost: jest.fn(async (body) => body),
    createPost: jest
      .fn()
      .mockResolvedValue([{ postId: 'novo', integration: 'i' }]),
  };
  const integration = {
    getIntegrationById: jest
      .fn()
      .mockResolvedValue({
        id: 'i',
        profileId: 'perfil',
        providerIdentifier: 'instagram',
      }),
  };
  const management = {
    scope: jest
      .fn()
      .mockResolvedValue({ organizationId: 'org', profileId: 'perfil' }),
    options: jest.fn().mockResolvedValue([{ id: 'tag', name: 'Campanha' }]),
  };
  const options = {
    requestContext: {
      get: (key: string) =>
        ({ organization: '{"id":"org"}', profileId: 'perfil' }[key]),
    },
  };
  beforeEach(() => jest.clearAllMocks());
  it('expoe tags intervalo alt thumbnail e delay sem perder o formato anterior', async () => {
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    const result = await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00.000Z',
            shortLink: false,
            type: 'schedule',
            intervalInDays: 7,
            tags: [{ value: 'tag', label: 'Campanha' }],
            settings: [
              { key: 'post_type', value: '"post"' },
              { key: 'is_trial_reel', value: 'false' },
            ],
            postsAndComments: [
              {
                content: '<p>Post</p>',
                media: [
                  {
                    id: 'm',
                    path: 'https://example.com/a.jpg',
                    alt: 'Foto',
                    thumbnail: 'https://example.com/thumb.jpg',
                  },
                ],
                delay: 2,
              },
            ],
          },
        ],
      },
      options
    );
    expect(result.output).toHaveLength(1);
    expect(posts.mapTypeToPost).toHaveBeenCalled();
    expect(posts.createPost).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({
        inter: 7,
        tags: [{ value: 'tag', label: 'Campanha' }],
        posts: [
          expect.objectContaining({
            settings: expect.objectContaining({ is_trial_reel: false }),
            value: [
              expect.objectContaining({
                delay: 2,
                image: [expect.objectContaining({ alt: 'Foto' })],
              }),
            ],
          }),
        ],
      }),
      'perfil'
    );
  });
  it('valida lote inteiro antes de criar e aceita attachments antigo', async () => {
    posts.mapTypeToPost.mockRejectedValueOnce(new Error('invalid'));
    const tool: any = new IntegrationSchedulePostTool(
      posts as any,
      integration as any,
      management as any
    ).run();
    await tool.execute(
      {
        socialPost: [
          {
            integrationId: 'i',
            isPremium: false,
            date: '2026-11-01T15:00:00.000Z',
            shortLink: false,
            type: 'schedule',
            settings: [],
            postsAndComments: [
              { content: 'Post', attachments: ['https://example.com/a.jpg'] },
            ],
          },
        ],
      },
      options
    );
    expect(posts.createPost).not.toHaveBeenCalled();
  });
  it('informa ids tentados quando falha apos possivel gravacao parcial da raiz', async () => {
    posts.createPost.mockRejectedValueOnce(new Error('database interrupted'));
    const tool: any = new IntegrationSchedulePostTool(posts as any, integration as any, management as any).run();
    const result = await tool.execute({ socialPost: [{ integrationId: 'i', isPremium: false, date: '2026-11-01T15:00:00.000Z', shortLink: false, type: 'schedule', settings: [], postsAndComments: [{ content: 'Post', attachments: [] }] }] }, options);
    expect(result).toMatchObject({ outcomeUnknown: true, uncertainPosts: [expect.objectContaining({ postId: expect.any(String), integration: 'i' })] });
  });
});
