jest.mock('../../../integrations/integration.manager', () => ({
  socialIntegrationList: [{ identifier: 'instagram', maxLength: () => 2200 }],
}));
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
import { createMock } from '../../../test';
import { PostManagementService } from './post-management.service';
import { PostManagementRepository } from './post-management.repository';
import { PostsService } from './posts.service';
import { ProfileService } from '../profiles/profile.service';
import { ShortLinkService } from '../../../short-linking/short.link.service';
import {
  managedPostPatchSchema,
  managedPostActionSchema,
} from '../../../dtos/posts/post-management.dto';

describe('posts para agentes', () => {
  const scope = { organizationId: 'org', profileId: 'perfil' };
  const repo = createMock<PostManagementRepository>();
  const posts = createMock<PostsService>();
  const profiles = createMock<ProfileService>();
  const shortLinks = createMock<ShortLinkService>();
  let service: PostManagementService;
  const row = (): any => ({
    id: 'post',
    organizationId: 'org',
    profileId: 'perfil',
    integrationId: 'ig',
    parentPostId: null,
    group: 'grupo',
    state: 'QUEUE',
    content: '<p>Original</p>',
    settings: '{"__type":"instagram","post_type":"post","is_trial_reel":true}',
    image: '[{"id":"m","path":"https://example.com/a.jpg","alt":"Foto"}]',
    delay: 0,
    intervalInDays: null,
    publishDate: new Date(Date.now() + 86400000),
    updatedAt: new Date(),
    tags: [],
    integration: {
      id: 'ig',
      name: 'IG',
      providerIdentifier: 'instagram',
      disabled: false,
      token: 'NEVER_RETURN',
    },
  });
  beforeEach(() => {
    jest.resetAllMocks();
    service = new PostManagementService(repo, posts, profiles, shortLinks);
    repo.lock.mockImplementation(async (_s, _id, operation) =>
      operation(async () => {})
    );
    repo.detail.mockResolvedValue({ rows: [row()], version: 'v1' } as any);
    repo.write.mockImplementation(
      async (_s, _id, _version, change) =>
        ({
          rows: [
            {
              ...row(),
              ...(change.date ? { publishDate: new Date(change.date) } : {}),
              ...(change.state ? { state: change.state } : {}),
              ...(change.intervalInDays !== undefined
                ? { intervalInDays: change.intervalInDays }
                : {}),
            },
          ],
          version: 'v2',
        } as any)
    );
    posts.mapTypeToPost.mockImplementation(async (body) => body);
    posts.startWorkflow.mockResolvedValue(undefined);
    profiles.getDefaultProfile.mockResolvedValue({ id: 'default' } as any);
    profiles.getProfileById.mockResolvedValue({ id: 'perfil' } as any);
  });
  it('retorna detalhe editavel sem credenciais e com todos os campos comuns', async () => {
    const detail = await service.detail(scope, 'post');
    expect(JSON.stringify(detail)).not.toContain('NEVER_RETURN');
    expect(detail.configuration).toMatchObject({
      intervalInDays: null,
      messages: [{ id: 'post', media: [{ alt: 'Foto' }] }],
    });
    expect(detail.configuration.settings).toContainEqual({
      key: 'is_trial_reel',
      value: 'true',
    });
  });
  it('reagenda o mesmo id sem trocar mensagens, canal, grupo ou vinculo', async () => {
    const date = new Date(Date.now() + 172800000).toISOString();
    await service.action(scope, 'post', {
      operation: 'schedule',
      expectedVersion: 'v1',
      date,
    });
    expect(repo.write).toHaveBeenCalledWith(
      scope,
      'post',
      'v1',
      expect.objectContaining({ date, state: 'QUEUE' })
    );
    expect(repo.write.mock.calls[0][3]).not.toHaveProperty('messages');
    expect(posts.startWorkflow).toHaveBeenCalledWith(
      'instagram',
      'post',
      'org',
      'QUEUE',
      { id: 'ig', providerIdentifier: 'instagram' },
      { strict: true }
    );
  });
  it('faz merge de settings e preserva midias e mensagens omitidas', async () => {
    await service.update(scope, 'post', {
      expectedVersion: 'v1',
      configuration: { settings: [{ key: 'post_type', value: '"story"' }] },
    });
    expect(repo.write.mock.calls[0][3]).toMatchObject({
      settings: {
        __type: 'instagram',
        post_type: 'story',
        is_trial_reel: true,
      },
    });
    expect(repo.write.mock.calls[0][3]).not.toHaveProperty('messages');
  });
  it('recusa snapshot antigo e publicacao proxima sem gravar', async () => {
    await expect(
      service.update(scope, 'post', {
        expectedVersion: 'old',
        configuration: { intervalInDays: 3 },
      })
    ).rejects.toThrow('POST_VERSION_CONFLICT');
    repo.detail.mockResolvedValue({
      rows: [{ ...row(), publishDate: new Date() }],
      version: 'v1',
    } as any);
    await expect(
      service.action(scope, 'post', {
        operation: 'cancel',
        expectedVersion: 'v1',
      })
    ).rejects.toThrow('POST_PUBLICATION_WINDOW');
    expect(repo.write).not.toHaveBeenCalled();
  });
  it('nao reinicia recorrencia ou republica ao editar metadados publicados', async () => {
    repo.detail.mockResolvedValue({
      rows: [
        { ...row(), state: 'PUBLISHED', intervalInDays: 3, releaseId: '123' },
      ],
      version: 'v1',
    } as any);
    await service.update(scope, 'post', {
      expectedVersion: 'v1',
      localOnly: true,
      configuration: {
        messages: [{ id: 'post', content: '<p>Local</p>', media: [] }],
      },
    });
    expect(posts.startWorkflow).not.toHaveBeenCalled();
    await expect(
      service.action(scope, 'post', {
        operation: 'sync',
        expectedVersion: 'v1',
      })
    ).rejects.toThrow('POST_SYNC_STATE_UNSUPPORTED');
    await expect(
      service.action(scope, 'post', {
        operation: 'publish_now',
        expectedVersion: 'v1',
      })
    ).rejects.toThrow('REPUBLISH_REQUIRES_EXPLICIT_INTENT');
  });
  it('cancela e permite repetir stopOnly de recorrencia publicada mesmo apos falha', async () => {
    repo.detail.mockResolvedValue({
      rows: [
        {
          ...row(),
          state: 'PUBLISHED',
          intervalInDays: null,
          releaseId: '123',
        },
      ],
      version: 'v1',
    } as any);
    const result = await service.action(scope, 'post', {
      operation: 'cancel',
      expectedVersion: 'v1',
    });
    expect(repo.write.mock.calls[0][3]).toMatchObject({ intervalInDays: null });
    expect(repo.write.mock.calls[0][3]).not.toHaveProperty('state');
    expect(posts.startWorkflow.mock.calls[0][5]).toEqual({
      strict: true,
      stopOnly: true,
    });
    expect(result).toMatchObject({ saved: true });
  });
  it('retorna resultado parcial quando Temporal falha sem sugerir criar outro post', async () => {
    posts.startWorkflow.mockRejectedValue(
      new Error('sensitive-token-do-not-return')
    );
    const result = await service.action(scope, 'post', {
      operation: 'schedule',
      expectedVersion: 'v1',
      date: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(result).toMatchObject({
      id: 'post',
      saved: true,
      synchronizationError: 'POST_SCHEDULE_SYNC_FAILED',
    });
    expect(JSON.stringify(result)).not.toContain('sensitive-token');
  });
  it('stop funciona depois do horario e retry de resultado incerto exige republicacao explicita', async () => {
    repo.detail.mockResolvedValue({
      rows: [{ ...row(), publishDate: new Date() }],
      version: 'v1',
    } as any);
    await service.action(scope, 'post', {
      operation: 'stop',
      expectedVersion: 'v1',
    });
    expect(repo.write.mock.calls[0][3]).toMatchObject({
      state: 'DRAFT',
      intervalInDays: null,
      allowPublicationWindow: true,
    });
    expect(posts.startWorkflow.mock.calls[0][5]).toEqual({
      strict: true,
      stopOnly: true,
    });
    const sync = await service.action(scope, 'post', {
      operation: 'sync',
      expectedVersion: 'v1',
    });
    expect(sync).toMatchObject({
      saved: true,
      synchronizationError: 'POST_PUBLICATION_OUTCOME_REVIEW_REQUIRED',
    });
    await expect(
      service.action(scope, 'post', {
        operation: 'retry_publish',
        expectedVersion: 'v1',
      })
    ).rejects.toThrow('REPUBLISH_REQUIRES_EXPLICIT_INTENT');
    await service.action(scope, 'post', {
      operation: 'retry_publish',
      expectedVersion: 'v1',
      republish: true,
    });
    expect(repo.write.mock.calls.at(-1)?.[3]).toMatchObject({
      allowPublicationWindow: true,
      state: 'QUEUE',
    });
  });
  it('schemas recusam identidade e coercoes e resolve Default sem abrir outros perfis', async () => {
    expect(
      managedPostPatchSchema.safeParse({
        expectedVersion: 'v',
        configuration: { shortLink: 'false' },
      }).success
    ).toBe(false);
    expect(
      managedPostActionSchema.safeParse({
        operation: 'delete',
        expectedVersion: 'v',
        profileId: 'other',
      }).success
    ).toBe(false);
    expect(await service.scope('org')).toEqual({
      organizationId: 'org',
      profileId: 'default',
    });
  });
  it('edicao aplica o limite de texto da rede antes de salvar', async () => {
    await expect(
      service.update(scope, 'post', {
        expectedVersion: 'v1',
        configuration: {
          messages: [{ id: 'post', content: 'a'.repeat(2201), media: [] }],
        },
      })
    ).rejects.toThrow('POST_CONTENT_TOO_LONG');
    expect(repo.write).not.toHaveBeenCalled();
  });
});
