import { AutomationHistoryService } from './automation-history.service';
const scope = { organizationId: 'org', profileId: 'profile' };
const context = {
  id: 'f',
  integrationId: 'ig',
  integration: { name: 'Escorpiano' },
  channels: [] as any[],
};
const legacy = {
  id: 'e',
  flowId: 'f',
  status: 'WAITING_POSTBACK',
  igCommenterName: 'Pessoa',
  igCommenterId: 'actor',
  commentText: 'quero',
  igMediaId: 'post',
  triggerType: 'comment_on_post',
  startedAt: new Date('2026-10-27T10:00:00Z'),
  createdAt: new Date('2026-10-27T10:00:00Z'),
  executionLog: JSON.stringify([
    {
      nodeId: 'dm',
      nodeType: 'SEND_DM',
      status: 'completed',
      timestamp: '2026-10-27T10:00:01Z',
    },
    {
      nodeId: 't',
      nodeType: 'TRIGGER',
      status: 'awaiting_postback',
      timestamp: '2026-10-27T10:00:02Z',
    },
  ]),
};
describe('historico operacional', () => {
  let repo: any;
  let service: AutomationHistoryService;
  beforeEach(() => {
    repo = {
      context: jest.fn().mockResolvedValue(context),
      list: jest.fn().mockResolvedValue([legacy]),
      detail: jest.fn().mockResolvedValue(legacy),
    };
    service = new AutomationHistoryService(repo);
  });
  it('projeta timeline V1 sem inventar aceite de DM nem conteudo enviado', async () => {
    const item = await service.detail(scope, 'instagram', 'f', 'e');
    expect(item.status).toBe('waiting');
    expect(item.steps[0]).toMatchObject({
      kind: 'SEND_DM',
      status: 'completed',
    });
    expect(item.steps[0].message).toBeNull();
    expect(item.guidance).toBe('waiting_interaction');
  });
  it('ledger UNKNOWN prevalece sem expor snapshot ou erros brutos', async () => {
    repo.detail.mockResolvedValue({
      id: 'e',
      flowId: 'f',
      status: 'FAILED',
      integrationId: 'fb',
      platform: 'facebook',
      revision: 2,
      createdAt: legacy.createdAt,
      snapshot: {
        token: 'SECRET',
        event: {
          eventType: 'messenger_message',
          actorName: 'Pessoa',
          text: 'preco',
          externalActorId: 'a',
        },
        actions: [
          {
            key: 'messenger_reply',
            kind: 'messenger_reply',
            text: 'Resposta',
          },
        ],
      },
      error: 'access_token=SECRET',
      deliveries: [
        {
          id: 'd',
          actionKey: 'messenger_reply',
          status: 'UNKNOWN',
          error: 'Bearer SECRET',
          createdAt: legacy.createdAt,
          updatedAt: legacy.createdAt,
        },
      ],
    });
    const item = await service.detail(scope, 'shared', 'f', 'e');
    expect(item.status).toBe('unknown');
    expect(item.channel).toBe('messenger');
    expect(item.steps[0].status).toBe('unknown');
    expect(item.steps[0].message).toBe('Resposta');
    expect(JSON.stringify(item)).not.toMatch(
      /SECRET|snapshot|Bearer|access_token/
    );
  });
  it('Story com follow_check registrado nao vira envio desconhecido', async () => {
    repo.detail.mockResolvedValue({
      ...legacy,
      triggerType: 'story_reply',
      status: 'COMPLETED',
      executionLog: JSON.stringify([
        {
          nodeId: 't',
          nodeType: 'TRIGGER',
          status: 'follow_check',
          timestamp: '2026-10-27T10:00:01Z',
          error: 'source=story_reply follows=false',
        },
      ]),
    });
    const item = await service.detail(scope, 'instagram', 'f', 'e');
    expect(item.trigger).toBe('story_reply');
    expect(item.steps[0]).toMatchObject({
      kind: 'GATE_RESOLVE',
      status: 'completed',
      issue: 'FOLLOW_REQUIRED',
    });
  });
  it('paginacao usa cursor estavel e log invalido nao quebra detalhe', async () => {
    repo.list.mockResolvedValue([legacy, { ...legacy, id: 'older' }]);
    const result = await service.list(scope, 'instagram', 'f', { limit: 1 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeTruthy();
    repo.detail.mockResolvedValue({
      ...legacy,
      executionLog: '{"invalid":true}',
    });
    expect((await service.detail(scope, 'instagram', 'f', 'e')).steps).toEqual(
      []
    );
  });
  it('recusa perfil ausente, cursor invalido e detalhe fora da regra', async () => {
    await expect(
      service.list(
        { organizationId: 'org', profileId: '' },
        'instagram',
        'f',
        {}
      )
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.list(scope, 'instagram', 'f', { cursor: 'bad' })
    ).rejects.toMatchObject({ status: 400 });
    repo.detail.mockResolvedValue(null);
    await expect(
      service.detail(scope, 'instagram', 'f', 'other')
    ).rejects.toMatchObject({ status: 404 });
  });
});
