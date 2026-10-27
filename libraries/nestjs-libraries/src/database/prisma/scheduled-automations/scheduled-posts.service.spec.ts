import { createMock } from '../../../test';
import { ScheduledPostsService } from './scheduled-posts.service';
import { ScheduledPostsRepository } from './scheduled-posts.repository';
const scope = { organizationId: 'org', profileId: 'profile' };
const post = (extra = {}): any => ({
  id: 'post',
  ...scope,
  integrationId: 'ig',
  state: 'QUEUE',
  parentPostId: null,
  intervalInDays: null,
  deletedAt: null,
  releaseId: null,
  settings: '{}',
  ...extra,
});
describe('posts agendados de automacoes', () => {
  const repo = createMock<ScheduledPostsRepository>();
  const service = new ScheduledPostsService(repo);
  beforeEach(() => jest.clearAllMocks());
  it('valida trinta destinos separados sem depender da ordem da publicacao', async () => {
    repo.post.mockImplementation(async (_s, _i, id) => post({ id }) as any);
    for (let n = 30; n > 0; n--)
      await service.assertSelection(scope, 'ig', `p${n}`);
    expect(repo.post).toHaveBeenCalledTimes(30);
    expect(repo.post).toHaveBeenLastCalledWith(scope, 'ig', 'p1');
  });
  it.each([
    { organizationId: 'other' },
    { profileId: 'other' },
    { integrationId: 'other' },
    { deletedAt: new Date() },
    { parentPostId: 'parent' },
    { intervalInDays: 7 },
    { state: 'DRAFT' },
    { state: 'ERROR' },
    { state: 'PUBLISHED', releaseId: '123' },
    { releaseId: '123' },
    { settings: '{"post_type":"story"}' },
    { settings: 'invalid' },
  ])('recusa destino inelegivel %j', async (extra) => {
    repo.post.mockResolvedValue(post(extra) as any);
    await expect(
      service.assertSelection(scope, 'ig', 'post')
    ).rejects.toThrow();
  });
  it('nao revela um destino ausente ou de outro perfil', async () => {
    repo.post.mockResolvedValue(null);
    await expect(service.assertSelection(scope, 'ig', 'post')).rejects.toThrow(
      'SCHEDULED_POST_UNAVAILABLE'
    );
  });
  it('permite salvar novamente o mesmo alvo ja publicado, sem reapontar para outro', async () => {
    repo.post.mockResolvedValue(
      post({ state: 'PUBLISHED', releaseId: '123' }) as any
    );
    repo.hasTarget.mockResolvedValue(true);
    await service.assertSelection(scope, 'ig', 'post', 'flow');
    repo.hasTarget.mockResolvedValue(false);
    await expect(
      service.assertSelection(scope, 'ig', 'post', 'other')
    ).rejects.toThrow();
  });
  it('recusa modo agendado em Story ou junto de ids remotos', async () => {
    await expect(
      service.validateMode(scope, 'ig', {
        postMode: 'scheduled',
        scheduledPostId: 'post',
        triggerType: 'story_reply',
      })
    ).rejects.toThrow('SCHEDULED_COMMENTS_ONLY');
    await expect(
      service.validateMode(scope, 'ig', {
        postMode: 'scheduled',
        scheduledPostId: 'post',
        postIds: ['123'],
      })
    ).rejects.toThrow('INVALID_SCHEDULED_SELECTION');
    await expect(
      service.validateMode(scope, 'ig', {
        postMode: 'all',
        scheduledPostId: 'post',
      })
    ).rejects.toThrow('INVALID_SCHEDULED_SELECTION');
  });
});
