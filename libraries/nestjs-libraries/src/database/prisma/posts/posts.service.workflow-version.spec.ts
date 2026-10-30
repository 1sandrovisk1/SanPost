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
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));

import { createMock } from '@gitroom/nestjs-libraries/test';
import { PostsRepository } from './posts.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { PostsService } from './posts.service';

const emptyWorkflowList = {
  async *[Symbol.asyncIterator]() {
    return;
  },
};

const buildService = () => {
  const repository = createMock<PostsRepository>();
  const integrationService = createMock<IntegrationService>();
  const start = jest.fn().mockResolvedValue(undefined);
  const temporalService = {
    client: {
      getRawClient: jest.fn().mockReturnValue({
        workflow: {
          list: jest.fn().mockReturnValue(emptyWorkflowList),
          withDeadline: jest.fn(async (_deadline, operation) => operation()),
          start,
        },
      }),
      getWorkflowHandle: jest.fn(),
    },
  };
  const service = new PostsService(
    repository,
    null as any,
    integrationService,
    null as any,
    null as any,
    null as any,
    temporalService as any,
    null as any,
    null as any,
    {} as any,
    {} as any
  );

  return { service, start, temporalService };
};

describe('PostsService - selecao do workflow de publicacao', () => {
  it('aguarda RPC estrito com deadline real e preserva erro de agendamento', async () => {
    const { service, start, temporalService } = buildService();
    start.mockRejectedValue(new Error('offline'));
    await expect(
      service.startWorkflow(
        'instagram',
        'post-1',
        'org-1',
        'QUEUE',
        { id: 'i', providerIdentifier: 'instagram' },
        { strict: true }
      )
    ).rejects.toThrow('offline');
    expect(
      temporalService.client.getRawClient().workflow.withDeadline
    ).toHaveBeenCalledWith(expect.any(Number), expect.any(Function));
  });
  it('stopOnly de publicado nunca inicia publicacao e sync estrito nao aceita PUBLISHED', async () => {
    const { service, start } = buildService();
    await service.startWorkflow(
      'instagram',
      'post-1',
      'org-1',
      'PUBLISHED',
      { id: 'i', providerIdentifier: 'instagram' },
      { strict: true, stopOnly: true }
    );
    expect(start).not.toHaveBeenCalled();
    await expect(
      service.startWorkflow(
        'instagram',
        'post-1',
        'org-1',
        'PUBLISHED',
        { id: 'i', providerIdentifier: 'instagram' },
        { strict: true }
      )
    ).rejects.toThrow('POST_SYNC_STATE_UNSUPPORTED');
  });
  const originalEnv = {
    ids: process.env.POST_WORKFLOW_V112_INTEGRATION_IDS,
    providers: process.env.POST_WORKFLOW_V112_PROVIDERS,
    all: process.env.POST_WORKFLOW_V112_ALL,
  };

  afterEach(() => {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    };
    restore('POST_WORKFLOW_V112_INTEGRATION_IDS', originalEnv.ids);
    restore('POST_WORKFLOW_V112_PROVIDERS', originalEnv.providers);
    restore('POST_WORKFLOW_V112_ALL', originalEnv.all);
  });

  it('inicia V112 apenas para a integracao canario', async () => {
    process.env.POST_WORKFLOW_V112_INTEGRATION_IDS = 'integration-1';
    const { service, start } = buildService();

    await service.startWorkflow('instagram', 'post-1', 'org-1', 'QUEUE', {
      id: 'integration-1',
      providerIdentifier: 'instagram',
    });

    expect(start).toHaveBeenCalledWith(
      'postWorkflowV112',
      expect.objectContaining({ workflowId: 'post_post-1' })
    );
  });

  it('mantem V102 sem gate e para Zernio', async () => {
    delete process.env.POST_WORKFLOW_V112_INTEGRATION_IDS;
    delete process.env.POST_WORKFLOW_V112_PROVIDERS;
    process.env.POST_WORKFLOW_V112_ALL = 'true';
    const { service, start } = buildService();

    await service.startWorkflow('main', 'post-z', 'org-1', 'QUEUE', {
      id: 'integration-z',
      providerIdentifier: 'zernio-instagram',
    });

    expect(start).toHaveBeenCalledWith(
      'postWorkflowV112',
      expect.objectContaining({ workflowId: 'post_post-z' })
    );
  });
});
