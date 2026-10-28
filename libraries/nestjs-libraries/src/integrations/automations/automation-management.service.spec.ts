jest.mock('../integration.manager', () => ({}));
import { createMock } from '../../test';
import { AutomationHistoryService } from '../../database/prisma/automation-history/automation-history.service';
import { AutomationManagementService } from './automation-management.service';
import { FlowsService } from '../../database/prisma/flows/flows.service';
import { SharedFlowsService } from '../../database/prisma/flows-v2/shared-flows.service';
import { ScheduledPostsService } from '../../database/prisma/scheduled-automations/scheduled-posts.service';
import { ProfileService } from '../../database/prisma/profiles/profile.service';
import { RepostService } from '../../database/prisma/repost/repost.service';
import {
  simpleDefinition,
  normalizeDefinition,
} from '../../database/prisma/flows-v2/flow-definition';
import { automationCanvasSchema } from '../../dtos/flows/automation-management.dto';

describe('gerenciamento de automacoes por API e agentes', () => {
  const scope = { organizationId: 'org', profileId: 'perfil' };
  const flows = createMock<FlowsService>();
  const shared = createMock<SharedFlowsService>();
  const scheduled = createMock<ScheduledPostsService>();
  const profiles = createMock<ProfileService>();
  const repost = createMock<RepostService>();
  const executionHistory = createMock<AutomationHistoryService>();
  let service: AutomationManagementService;
  const legacy = () => ({
    id: 'ig-flow',
    name: 'IG',
    status: 'PAUSED',
    revision: 2,
    updatedAt: new Date('2026-10-27T12:00:00Z'),
    integrationId: 'ig',
    executionVersion: 1,
    nodes: [
      {
        id: 'trigger',
        type: 'TRIGGER',
        data: JSON.stringify({
          triggerType: 'comment_on_post',
          mode: 'scheduled',
          scheduledPostId: 'local-post',
          keywords: ['QUERO'],
          requireFollow: true,
          openingDmMessage: 'Inicio',
          openingDmButtonText: 'Receber',
          alreadyFollowedButtonText: 'Ja sigo',
          gateExhaustedMessage: 'Fim',
          maxGateAttempts: 7,
          followGateMessage: 'Siga',
        }),
      },
      {
        id: 'reply',
        type: 'REPLY_COMMENT',
        data: JSON.stringify({ messages: ['A', 'B'], message: 'A' }),
      },
      {
        id: 'dm',
        type: 'SEND_DM',
        data: JSON.stringify({
          message: 'Link',
          buttonText: 'Ver',
          buttonUrl: 'https://example.com',
        }),
      },
    ],
    edges: [
      { sourceNodeId: 'trigger', targetNodeId: 'reply' },
      { sourceNodeId: 'reply', targetNodeId: 'dm' },
    ],
  });
  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutomationManagementService(
      flows,
      shared,
      scheduled,
      profiles,
      repost,
      executionHistory
    );
    profiles.getProfileById.mockResolvedValue({ id: 'perfil' } as any);
    profiles.getDefaultProfile.mockResolvedValue({ id: 'default' } as any);
    shared.listChannels.mockResolvedValue([
      { id: 'ig', providerIdentifier: 'instagram' },
      { id: 'fb', providerIdentifier: 'facebook' },
    ] as any);
    flows.getFlow.mockResolvedValue(legacy() as any);
    flows.listAliases.mockResolvedValue([]);
    flows.quickCreateFlow.mockResolvedValue({
      id: 'ig-flow',
      status: 'ACTIVE',
    } as any);
    flows.createFlow.mockResolvedValue({
      id: 'ig-flow',
      status: 'DRAFT',
    } as any);
    flows.createDraftFlow.mockResolvedValue({
      id: 'ig-flow',
      status: 'DRAFT',
    } as any);
    flows.checkIntegrationWebhook.mockResolvedValue({ ok: true });
    flows.updateFlowStatus.mockResolvedValue({
      id: 'ig-flow',
      status: 'ACTIVE',
    } as any);
    flows.quickUpdateFlow.mockResolvedValue(legacy() as any);
    shared.save.mockResolvedValue({
      id: 'fb-flow',
      name: 'FB',
      status: 'DRAFT',
      revision: 1,
      executionVersion: 2,
      channels: [
        {
          integrationId: 'fb',
          platform: 'facebook',
          postMode: 'all',
          postIds: [],
        },
      ],
      definition: simpleDefinition({ message: 'Oi' }),
    } as any);
    shared.status.mockResolvedValue({
      id: 'fb-flow',
      status: 'ACTIVE',
      revision: 2,
    } as any);
  });
  it.each([
    {
      platform: 'instagram',
      triggerType: 'comment_on_post',
      integrationId: 'ig',
    },
    {
      platform: 'facebook',
      triggerType: 'comment_on_post',
      integrationId: 'fb',
    },
    {
      platform: 'facebook',
      triggerType: 'messenger_message',
      integrationId: 'fb',
    },
  ])(
    'recusa conta fora do Default pela fachada antes de salvar: %p',
    async (channel) => {
      const resolved = await service.scope('org');
      shared.listChannels.mockResolvedValue([]);
      await expect(
        service.create(resolved, {
          ...channel,
          name: 'Outro perfil',
          keywords: ['quero'],
          dmMessage: 'Link',
          activate: false,
        })
      ).rejects.toThrow('CHANNEL_NOT_FOUND');
      expect(shared.listChannels).toHaveBeenCalledWith({
        organizationId: 'org',
        profileId: 'default',
      });
      expect(flows.createDraftFlow).not.toHaveBeenCalled();
      expect(flows.quickUpdateFlow).not.toHaveBeenCalled();
      expect(flows.checkIntegrationWebhook).not.toHaveBeenCalled();
      expect(shared.save).not.toHaveBeenCalled();
      expect(shared.status).not.toHaveBeenCalled();
    }
  );
  it('encaminha todos os campos do follow gate, variacoes e alvo agendado do Instagram', async () => {
    const config = {
      name: 'Completa',
      integrationId: 'ig',
      platform: 'instagram',
      postMode: 'scheduled',
      scheduledPostId: 'local-post',
      keywords: ['QUERO'],
      matchMode: 'all',
      replyMessages: ['A', 'B'],
      dmMessage: 'DM',
      dmButtonText: 'Ver',
      dmButtonUrl: 'https://example.com',
      requireFollow: true,
      followGateMessage: 'Siga',
      openingDmMessage: 'Inicio',
      openingDmButtonText: 'Receber',
      alreadyFollowedButtonText: 'Ja sigo',
      gateExhaustedMessage: 'Fim',
      maxGateAttempts: 7,
    };
    await service.create(scope, config);
    const { platform, ...legacyConfig } = config;
    expect(flows.quickUpdateFlow).toHaveBeenCalledWith(
      'org',
      'ig-flow',
      expect.objectContaining({ ...legacyConfig, activate: false }),
      'perfil'
    );
    expect(flows.quickUpdateFlow.mock.calls[0][2]).not.toHaveProperty(
      'platform'
    );
  });
  it('cria Messenger com palavra chave e prioridade no mesmo motor deduplicado', async () => {
    await service.create(scope, {
      platform: 'facebook',
      name: 'Messenger',
      integrationId: 'fb',
      triggerType: 'messenger_message',
      keywords: ['preco'],
      priority: 25,
      dmMessage: 'Link',
    });
    const input = shared.save.mock.calls[0][1];
    expect(input.channels).toEqual([
      { integrationId: 'fb', postMode: 'all', postIds: [] },
    ]);
    expect(JSON.parse(input.definition.nodes[0].data)).toMatchObject({
      triggerType: 'messenger_message',
      priority: 25,
      keywords: ['preco'],
    });
    expect(flows.quickCreateFlow).not.toHaveBeenCalled();
  });
  it('prepara Instagram sem preflight e revalida a conexao somente na ativacao explicita', async () => {
    await service.create(scope, {
      name: 'Draft',
      integrationId: 'ig',
      postMode: 'all',
      dmMessage: 'Link',
      activate: false,
    });
    expect(flows.createDraftFlow).toHaveBeenCalledWith(
      'org',
      expect.objectContaining({ integrationId: 'ig' }),
      'perfil'
    );
    expect(flows.createFlow).not.toHaveBeenCalled();
    expect(flows.checkIntegrationWebhook).not.toHaveBeenCalled();
    flows.checkIntegrationWebhook.mockResolvedValue({
      ok: false,
      error: 'detalhes internos',
    });
    await expect(service.status(scope, 'ig-flow', 1, 'ACTIVE')).rejects.toThrow(
      'CONNECTION_CHECK_REQUIRED'
    );
    expect(flows.updateFlowStatus).not.toHaveBeenCalled();
  });
  it('cria e edita resposta publica Facebook sem inserir DM vazia e preserva layout', async () => {
    shared.save.mockImplementation(
      async (_scope, body) =>
        ({
          id: 'fb-flow',
          name: body.name,
          status: 'DRAFT',
          revision: 1,
          executionVersion: 2,
          channels: [
            {
              integrationId: 'fb',
              platform: 'facebook',
              postMode: 'all',
              postIds: [],
            },
          ],
          definition: normalizeDefinition(body.definition),
        } as any)
    );
    await service.create(scope, {
      platform: 'facebook',
      name: 'Publica',
      integrationId: 'fb',
      postMode: 'all',
      replyMessages: ['A', 'B'],
      activate: false,
    });
    expect(
      shared.save.mock.calls[0][1].definition.nodes.map((n) => n.type)
    ).toEqual(['TRIGGER', 'REPLY_COMMENT']);
    const flow = (await shared.save.mock.results[0].value) as Awaited<
      ReturnType<SharedFlowsService['save']>
    >;
    flow.definition.nodes[1].label = 'Publica personalizada';
    flow.definition.nodes[1].positionX = 713;
    shared.get.mockResolvedValue(flow);
    await service.update(scope, 'fb-flow', 2, {
      configuration: { name: 'Novo nome' },
      expectedRevision: 1,
    });
    expect(shared.save.mock.calls[1][1].definition.nodes[1]).toMatchObject({
      label: 'Publica personalizada',
      positionX: 713,
    });
    expect(
      shared.save.mock.calls[1][1].definition.nodes.some(
        (n) => n.type === 'SEND_DM'
      )
    ).toBe(false);
  });
  it('nao aceita aliases em Story nem nome de canvas vazio', async () => {
    const story = legacy();
    story.nodes[0].data = JSON.stringify({
      triggerType: 'story_reply',
      mode: 'all',
    });
    flows.getFlow.mockResolvedValue(story as any);
    await expect(
      service.aliases(scope, 'ig-flow', {
        operation: 'add',
        aliasMediaId: '1234',
      })
    ).rejects.toThrow('INSTAGRAM_COMMENT_ALIASES_ONLY');
    expect(flows.addManualAlias).not.toHaveBeenCalled();
    expect(
      automationCanvasSchema.safeParse({ name: '  ', nodes: [], edges: [] })
        .success
    ).toBe(false);
  });
  it.each([
    { platform: 'facebook', integrationId: 'fb', requireFollow: true },
    {
      platform: 'facebook',
      integrationId: 'fb',
      dmMessage: '',
      activate: false,
    },
    {
      platform: 'facebook',
      integrationId: 'fb',
      triggerType: 'messenger_message',
      keywords: [],
    },
    {
      platform: 'facebook',
      integrationId: 'fb',
      triggerType: 'messenger_message',
      keywords: ['x'],
      postMode: 'specific',
      postIds: ['1_2'],
    },
    { integrationId: 'ig', postMode: 'all', postIds: ['123'] },
    {
      integrationId: 'ig',
      triggerType: 'story_reply',
      replyMessages: ['Nao pode'],
    },
    {
      integrationId: 'ig',
      triggerType: 'story_reply',
      postMode: 'scheduled',
      scheduledPostId: 'local',
    },
    { integrationId: 'ig', extraField: 'nao ignorar' },
  ])('rejeita combinacao incompatível antes de gravar %#', async (extra) => {
    await expect(
      service.create(scope, { name: 'Teste', dmMessage: 'DM', ...extra })
    ).rejects.toBeDefined();
    expect(flows.quickCreateFlow).not.toHaveBeenCalled();
    expect(shared.save).not.toHaveBeenCalled();
  });
  it('recupera todos os campos e atualiza parcialmente sem apagar follow gate e variacoes', async () => {
    const detail = await service.detail(scope, 'ig-flow', 1);
    expect(detail.configuration).toMatchObject({
      postMode: 'scheduled',
      scheduledPostId: 'local-post',
      replyMessages: ['A', 'B'],
      openingDmMessage: 'Inicio',
      maxGateAttempts: 7,
    });
    await service.update(scope, 'ig-flow', 1, {
      configuration: { dmMessage: 'Alterada' },
      expectedUpdatedAt: detail.updatedAt,
    });
    expect(flows.quickUpdateFlow).toHaveBeenCalledWith(
      'org',
      'ig-flow',
      expect.objectContaining({
        dmMessage: 'Alterada',
        replyMessages: ['A', 'B'],
        maxGateAttempts: 7,
        scheduledPostId: 'local-post',
      }),
      'perfil'
    );
  });
  it('canvas do detalhe normaliza nulos opcionais para permitir ida e volta sem perda', async () => {
    const graph = legacy();
    flows.getFlow.mockResolvedValue({
      ...graph,
      nodes: graph.nodes.map((n, i) => ({
        ...n,
        label: null,
        positionX: 0,
        positionY: i * 100,
      })),
      edges: graph.edges.map((e, i) => ({
        ...e,
        id: `edge-${i}`,
        sourceHandle: null,
      })),
    } as any);
    const detail = await service.detail(scope, 'ig-flow', 1);
    expect(
      'canvas' in detail &&
        automationCanvasSchema.safeParse(detail.canvas).success
    ).toBe(true);
    if ('canvas' in detail) {
      await service.canvas(scope, 'ig-flow', 1, {
        ...detail.canvas,
        expectedUpdatedAt: detail.updatedAt,
      });
      expect(flows.saveCanvas).toHaveBeenCalledWith(
        'org',
        'ig-flow',
        expect.objectContaining({ expectedUpdatedAt: detail.updatedAt }),
        'perfil'
      );
    }
  });
  it('nao achata grafo personalizado nem troca conta durante update', async () => {
    const flow = legacy();
    flow.nodes.push({ id: 'delay', type: 'DELAY', data: '{"duration":5}' });
    flows.getFlow.mockResolvedValue(flow as any);
    await expect(
      service.update(scope, 'ig-flow', 1, { configuration: { dmMessage: 'X' } })
    ).rejects.toThrow('CANVAS_EDIT_REQUIRED');
    flows.getFlow.mockResolvedValue(legacy() as any);
    await expect(
      service.update(scope, 'ig-flow', 1, {
        configuration: { integrationId: 'outra' },
      })
    ).rejects.toThrow('INTEGRATION_IMMUTABLE');
    expect(flows.quickUpdateFlow).not.toHaveBeenCalled();
  });
  it('nao le aliases nem historico se o flow nao pertence ao perfil', async () => {
    flows.getFlow.mockResolvedValue(null);
    await expect(service.detail(scope, 'outro', 1)).rejects.toThrow(
      'FLOW_NOT_FOUND'
    );
    await expect(service.history(scope, 'outro', 1)).rejects.toThrow(
      'FLOW_NOT_FOUND'
    );
    await expect(
      service.aliases(scope, 'outro', { operation: 'list' })
    ).rejects.toThrow('FLOW_NOT_FOUND');
    expect(flows.listAliases).not.toHaveBeenCalled();
    expect(flows.getExecutions).not.toHaveBeenCalled();
  });
  it('exige revisao fornecida para editar V2 em vez de usar a recem consultada', async () => {
    shared.get.mockResolvedValue(await shared.save(scope, {} as any));
    shared.save.mockClear();
    await expect(
      service.update(scope, 'fb-flow', 2, {
        configuration: { dmMessage: 'Nova' },
      })
    ).rejects.toThrow('REVISION_REQUIRED');
    expect(shared.save).not.toHaveBeenCalled();
  });
  it('valida configuracao interna do canvas antes de salvar, inclusive URL e ciclo', async () => {
    await expect(
      service.canvas(scope, 'ig-flow', 1, {
        expectedUpdatedAt: '2026-10-27T12:00:00.000Z',
        nodes: [
          {
            id: 't',
            type: 'TRIGGER',
            data: '{"mode":"all","triggerType":"comment_on_post"}',
            positionX: 0,
            positionY: 0,
          },
          {
            id: 'dm',
            type: 'SEND_DM',
            data: '{"message":"X","buttonText":"Ir","buttonUrl":"http://localhost"}',
            positionX: 0,
            positionY: 0,
          },
        ],
        edges: [{ sourceNodeId: 't', targetNodeId: 'dm' }],
      })
    ).rejects.toBeDefined();
    expect(flows.saveCanvas).not.toHaveBeenCalled();
  });
  it('recusa edicao V1 sem snapshot e quando snapshot esta desatualizado', async () => {
    await expect(
      service.update(scope, 'ig-flow', 1, { configuration: { dmMessage: 'X' } })
    ).rejects.toThrow('UPDATED_AT_REQUIRED');
    await expect(
      service.update(scope, 'ig-flow', 1, {
        configuration: { dmMessage: 'X' },
        expectedUpdatedAt: '2026-10-27T11:00:00.000Z',
      })
    ).rejects.toThrow('REVISION_CONFLICT');
    expect(flows.quickUpdateFlow).not.toHaveBeenCalled();
  });
  it('resolve somente o perfil Default da org quando contexto nao tem perfil', async () => {
    const resolved = await service.scope('org');
    expect(resolved).toEqual({ organizationId: 'org', profileId: 'default' });
    expect(profiles.getDefaultProfile).toHaveBeenCalledWith('org');
  });
});

describe('historico normalizado da fachada', () => {
  const h = createMock<AutomationHistoryService>();
  const scope = { organizationId: 'org', profileId: 'escorpiano' };
  const facade = () =>
    new AutomationManagementService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      h
    );
  beforeEach(() => jest.clearAllMocks());
  it.each([
    [1, 'instagram'],
    [2, 'shared'],
  ] as const)(
    'reusa a projecao do painel no motor %s',
    async (version, engine) => {
      await facade().executionHistory(scope, 'f', version, {
        status: 'failed',
        limit: 5,
      });
      expect(h.list).toHaveBeenCalledWith(scope, engine, 'f', {
        status: 'failed',
        limit: 5,
      });
      await facade().executionDetail(scope, 'f', version, 'exec');
      expect(h.detail).toHaveBeenCalledWith(scope, engine, 'f', 'exec');
    }
  );
  it('recusa versao invalida e parametros desconhecidos antes da consulta', async () => {
    await expect(facade().executionHistory(scope, 'f', 3, {})).rejects.toThrow(
      'INVALID_EXECUTION_VERSION'
    );
    await expect(
      facade().executionHistory(scope, 'f', 2, { page: 1 } as any)
    ).rejects.toThrow('INVALID_HISTORY_QUERY');
    expect(h.list).not.toHaveBeenCalled();
  });
});
