import { PrismaService } from '../prisma.service';
import { SharedFlowsRepository } from './shared-flows.repository';
import { simpleDefinition } from './flow-definition';
import { createHmac, randomUUID } from 'node:crypto';
import { parseFacebookCommentWebhook } from '../../../integrations/automations/facebook-automation-webhook';
const url = process.env.SHARED_FLOW_TEST_DATABASE_URL;
const integrationSuite = url ? describe : describe.skip;
integrationSuite('persistencia V2 com PostgreSQL isolado', () => {
  let db: PrismaService;
  let repo: SharedFlowsRepository;
  let scope: { organizationId: string; profileId: string };
  let integrationId: string;
  beforeAll(async () => {
    if (!new URL(url!).pathname.startsWith('/multipost_shared_test_'))
      throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
    process.env.DATABASE_URL = url;
    db = new PrismaService();
    await db.$connect();
    repo = new SharedFlowsRepository(db);
  });
  afterAll(async () => {
    await db?.$disconnect();
  });
  beforeEach(async () => {
    const org = await db.organization.create({
      data: { name: `test-${randomUUID()}` },
    });
    const profile = await db.profile.create({
      data: { organizationId: org.id, name: 'Teste', slug: randomUUID() },
    });
    scope = { organizationId: org.id, profileId: profile.id };
    const integration = await db.integration.create({
      data: {
        ...scope,
        internalId: randomUUID()
          .replace(/[^0-9]/g, '')
          .slice(0, 12),
        name: 'Page fixture',
        providerIdentifier: 'facebook',
        type: 'social',
        token: 'FIXTURE-NOT-A-REAL-TOKEN',
      },
    });
    integrationId = integration.id;
  });
  async function create(mode = 'specific', keywords: string[] = []) {
    const integration = await repo.integration(scope, integrationId);
    const channel = {
      integrationId,
      platform: 'facebook',
      remoteAccountId: integration.internalId,
      postMode: mode,
      postIds: mode === 'specific' ? [`${integration.internalId}_777`] : [],
    };
    const id = await repo.save(
      scope,
      {
        name: 'Teste',
        channels: [channel as any],
        definition: simpleDefinition({
          keywords,
          message: 'https://example.com',
        }),
      },
      [channel]
    );
    await repo.setStatus(scope, id, 1, 'ACTIVE');
    const row = await repo.get(scope, id);
    const event = {
      ...scope,
      integrationId,
      platform: 'facebook' as const,
      remoteAccountId: integration.internalId,
      externalEventId: '777_888',
      externalPostId: `${integration.internalId}_777`,
      externalActorId: '999',
      text: 'link',
      occurredAt: Date.now() + 10,
    };
    return { row, event, channel };
  }
  it('grava uma execucao/despacho com webhooks concorrentes e bloqueia perfil estranho', async () => {
    const { row, event } = await create();
    await Promise.all(Array.from({ length: 8 }, () => repo.ingest(event)));
    expect(await db.automationEvent.count({ where: { integrationId } })).toBe(
      1
    );
    expect(await db.flowExecutionV2.count({ where: { flowId: row.id } })).toBe(
      1
    );
    expect(
      await db.automationDispatch.count({ where: { flowId: row.id } })
    ).toBe(1);
    await expect(
      repo.get({ ...scope, profileId: 'other' }, row.id)
    ).rejects.toThrow('FLOW_NOT_FOUND');
    const snapshot = (await db.flowExecutionV2.findFirst({
      where: { flowId: row.id },
    }))!.snapshot;
    expect(JSON.stringify(snapshot)).not.toContain('FIXTURE');
  });
  it('vincula comentario de post ausente do feed pelo ID salvo e deduplica o webhook', async () => {
    // Fixture sintetica: prova o contrato, nao a entrega real de anuncios da Meta.
    const { row, event } = await create();
    expect((await repo.get(scope, row.id)).channels[0].postIds).toEqual([
      event.externalPostId,
    ]);
    const raw = Buffer.from(
      JSON.stringify({
        object: 'page',
        entry: [
          {
            id: event.remoteAccountId,
            changes: [
              {
                field: 'feed',
                value: {
                  item: 'comment',
                  verb: 'add',
                  post_id: event.externalPostId,
                  parent_id: event.externalPostId,
                  comment_id: event.externalEventId,
                  from: { id: event.externalActorId },
                  message: 'link',
                  created_time: Math.ceil(event.occurredAt / 1000),
                },
              },
            ],
          },
        ],
      })
    );
    const secret = 'fixture-secret';
    const { events } = parseFacebookCommentWebhook(
      raw,
      `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
      [
        {
          ...scope,
          integrationId,
          pageId: event.remoteAccountId,
          appSecret: secret,
        },
      ]
    );
    expect(events).toHaveLength(1);
    const { pageId, ...normalized } = events[0];
    const signedEvent = { ...normalized, remoteAccountId: pageId };
    expect(
      await repo.ingest({
        ...signedEvent,
        externalPostId: `${event.remoteAccountId}_778`,
        externalEventId: '778_888',
      })
    ).toEqual([]);
    await Promise.all([repo.ingest(signedEvent), repo.ingest(signedEvent)]);
    expect(await db.flowExecutionV2.count({ where: { flowId: row.id } })).toBe(
      1
    );
    expect(
      await db.automationDispatch.count({ where: { flowId: row.id } })
    ).toBe(1);
  });
  it('reserva privada global e resultado incerto nao sao reenviados', async () => {
    const { row, event } = await create();
    await repo.ingest(event);
    const execution = (await db.flowExecutionV2.findFirst({
      where: { flowId: row.id },
    }))!;
    const action = {
      key: 'private_reply',
      kind: 'private_reply' as const,
      text: 'Oi',
      delaySeconds: 0,
    };
    const reservations = await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.reserveEffect(execution, event.externalEventId, action)
      )
    );
    expect(reservations.filter((r) => r.send)).toHaveLength(1);
    expect(reservations.filter((r) => r.status === 'UNKNOWN')).toHaveLength(4);
  });
  it('roteia contas distintas sem cruzar perfil ou organizacao, inclusive com IDs de comentario iguais', async () => {
    const a = await create('all');
    const otherOrg = await db.organization.create({
      data: { name: 'Other test' },
    });
    const profiles = await Promise.all(
      [scope.organizationId, otherOrg.id].map((organizationId) =>
        db.profile.create({
          data: { organizationId, name: 'Other fixture', slug: randomUUID() },
        })
      )
    );
    const scopes = [
      scope,
      ...profiles.map((p) => ({
        organizationId: p.organizationId,
        profileId: p.id,
      })),
    ];
    const cases = [{ row: a.row, event: a.event }];
    for (const [index, owner] of scopes.entries()) {
      const account = await db.integration.create({
        data: {
          ...owner,
          internalId: `555000${index}`,
          name: 'Isolation fixture',
          providerIdentifier: 'facebook',
          type: 'social',
          token: 'FIXTURE',
        },
      });
      const channel = {
        integrationId: account.id,
        platform: 'facebook',
        remoteAccountId: account.internalId,
        postMode: 'all',
        postIds: [] as string[],
      };
      const id = await repo.save(
        owner,
        {
          name: 'Isolation',
          channels: [channel as any],
          definition: simpleDefinition({ message: 'Test' }),
        },
        [channel]
      );
      await repo.setStatus(owner, id, 1, 'ACTIVE');
      const row = await repo.get(owner, id);
      cases.push({
        row,
        event: {
          ...a.event,
          ...owner,
          integrationId: account.id,
          remoteAccountId: account.internalId,
          externalPostId: `${account.internalId}_777`,
          occurredAt: Date.now() + 10,
        },
      });
    }
    expect(
      await repo.ingest({ ...a.event, profileId: profiles[0].id })
    ).toEqual([]);
    expect(
      await repo.ingest({ ...a.event, organizationId: otherOrg.id })
    ).toEqual([]);
    expect(
      await repo.ingest({
        ...a.event,
        remoteAccountId: cases[1].event.remoteAccountId,
      })
    ).toEqual([]);
    await expect(
      repo.integration({ ...scope, profileId: profiles[0].id }, integrationId)
    ).rejects.toThrow('CHANNEL_NOT_FOUND');
    for (const fixture of cases) {
      const ids = await repo.ingest(fixture.event);
      expect(ids).toHaveLength(1);
      const execution = await db.flowExecutionV2.findUnique({
        where: { id: ids[0] },
      });
      expect(execution).toMatchObject({
        flowId: fixture.row.id,
        organizationId: fixture.event.organizationId,
        profileId: fixture.event.profileId,
        integrationId: fixture.event.integrationId,
        remoteAccountId: fixture.event.remoteAccountId,
      });
    }
    for (const fixture of cases)
      expect(
        await db.flowExecutionV2.count({ where: { flowId: fixture.row.id } })
      ).toBe(1);
  });
  it('revisao obsoleta falha e pausa cancela efeito pendente', async () => {
    const { row, event } = await create();
    await repo.ingest(event);
    await expect(repo.setStatus(scope, row.id, 1, 'PAUSED')).rejects.toThrow(
      'REVISION_CONFLICT'
    );
    await repo.setStatus(scope, row.id, row.revision, 'PAUSED');
    const execution = (await db.flowExecutionV2.findFirst({
      where: { flowId: row.id },
    }))!;
    expect(
      (
        await repo.reserveEffect(execution, event.externalEventId, {
          key: 'private_reply',
          kind: 'private_reply',
          text: 'Oi',
          delaySeconds: 0,
        })
      ).status
    ).toBe('CANCELLED');
  });
  it('editar ativa preserva identidade e vinculo da proxima publicacao', async () => {
    const { row, event } = await create('next_publication');
    await repo.ingest(event);
    const before = await repo.get(scope, row.id);
    const c = before.channels[0];
    await repo.save(scope, { name: 'Editada', definition: simpleDefinition({ message: 'Novo texto' }), channels: [{ integrationId, postMode: 'next_publication', postIds: [] as string[] }], expectedRevision: before.revision }, [{ integrationId, platform: c.platform, remoteAccountId: c.remoteAccountId, postMode: 'next_publication', postIds: [], flowId: 'foreign', id: 'foreign-channel' } as any], row.id);
    const after = await repo.get(scope, row.id);
    expect(after.status).toBe('ACTIVE');
    expect(after.channels[0]).toMatchObject({ id: c.id, activatedAt: c.activatedAt, boundPostId: c.boundPostId });
    expect(after.revision).toBe(before.revision + 1);
    expect(await repo.ingest({ ...event, externalEventId: '999', externalPostId: `${event.remoteAccountId}_999` })).toEqual([]);
  });
  it('duas edicoes ativas com a mesma revisao so permitem uma gravacao', async () => {
    const { row } = await create('all');
    const c = row.channels[0];
    const value = { integrationId, platform: c.platform, remoteAccountId: c.remoteAccountId, postMode: 'all', postIds: [] as string[] };
    const input = { name: 'Editada', definition: simpleDefinition({ message: 'Novo' }), channels: [{ integrationId, postMode: 'all' as const, postIds: [] as string[] }], expectedRevision: row.revision };
    const results = await Promise.allSettled([repo.save(scope, input, [value], row.id), repo.save(scope, input, [value], row.id)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await repo.get(scope, row.id)).channels[0].id).toBe(c.id);
  });
  it('bind legado diferido compara revisao e data na mesma transacao do gatilho', async () => {
    const ig = await db.integration.create({ data: { ...scope, name: 'IG fixture', internalId: '998877', providerIdentifier: 'instagram', type: 'social', token: 'FIXTURE' } });
    const flow = await db.flow.create({ data: { ...scope, name: 'Proximo IG', integrationId: ig.id, status: 'ACTIVE', executionVersion: 1, revision: 3 } });
    const node = await db.flowNode.create({ data: { flowId: flow.id, type: 'TRIGGER', data: '{"mode":"next_publication"}', positionX: 0, positionY: 0 } });
    const cfg = { mode: 'specific', postIds: ['991'] };
    expect(await repo.bindLegacyNext(flow.id, node.id, cfg, '991', { revision: 2, updatedAt: flow.updatedAt.toISOString() })).toBe(false);
    expect(await repo.bindLegacyNext(flow.id, node.id, cfg, '991', { revision: 3, updatedAt: flow.updatedAt.toISOString() })).toBe(true);
    const bound = await db.flow.findUniqueOrThrow({ where: { id: flow.id } });
    expect(bound.updatedAt).toEqual(flow.updatedAt);
    expect(bound.triggerPostIds).toBe('["991"]');
    expect(JSON.parse((await db.flowNode.findUniqueOrThrow({ where: { id: node.id } })).data)).toEqual(cfg);
    await db.flow.update({ where: { id: flow.id }, data: { name: 'Mudou a regra' } });
    expect(await repo.admitLegacy({ flowId: flow.id, igCommentId: '1001', igMediaId: '991', igCommenterId: '888', commentText: 'quero', triggerType: 'comment_on_post' }, { kind: 'next', targetId: '', revision: 3, updatedAt: flow.updatedAt.toISOString(), externalPostId: '991' })).toBeNull();
  });
  it('proxima publicacao ignora comentario fora da regra', async () => {
    const { row, event } = await create('next_publication', ['quero']);
    await repo.ingest(event);
    expect((await repo.get(scope, row.id)).channels[0].boundPostId).toBeNull();
    await repo.ingest({
      ...event,
      externalEventId: '778_889',
      externalPostId: `${event.remoteAccountId}_778`,
      text: 'quero',
    });
    expect((await repo.get(scope, row.id)).channels[0].boundPostId).toBe(
      `${event.remoteAccountId}_778`
    );
  });
  it('execucao legada com trigger nulo impede ativacao V2', async () => {
    const { row, channel } = await create();
    await repo.setStatus(scope, row.id, row.revision, 'PAUSED');
    await db.integration.update({
      where: { id: integrationId },
      data: { providerIdentifier: 'instagram' },
    });
    await db.flowChannel.updateMany({
      where: { flowId: row.id },
      data: { platform: 'instagram' },
    });
    const legacy = await db.flow.create({
      data: { ...scope, integrationId, name: 'Legacy', status: 'PAUSED' },
    });
    await db.flowExecution.create({
      data: {
        flowId: legacy.id,
        igCommenterId: '999',
        igMediaId: '777',
        commentText: 'Oi',
        status: 'RUNNING',
      },
    });
    await expect(
      repo.setStatus(scope, row.id, row.revision + 1, 'ACTIVE')
    ).rejects.toThrow('LEGACY_COMMENT_FLOW_ACTIVE');
    expect(channel.platform).toBe('facebook');
  });
  async function createMessenger(priority = 10, keywords = ['link']) {
    const integration = await repo.integration(scope, integrationId);
    const channel = {
      integrationId,
      platform: 'facebook',
      remoteAccountId: integration.internalId,
      postMode: 'all' as const,
      postIds: [] as string[],
    };
    const id = await repo.save(
      scope,
      {
        name: `Messenger ${priority}`,
        channels: [channel],
        definition: simpleDefinition({
          triggerType: 'messenger_message',
          priority,
          keywords,
          message: 'Teste',
        }),
      },
      [channel]
    );
    const event = {
      ...scope,
      integrationId,
      platform: 'facebook' as const,
      eventType: 'messenger_message' as const,
      remoteAccountId: integration.internalId,
      externalEventId: 'm_test:opaque',
      externalPostId: '',
      externalActorId: '999',
      text: 'quero link',
      occurredAt: Date.now() + 1000,
    };
    return { id, event, channel };
  }
  it('Messenger escolhe uma vencedora e deduplica entregas concorrentes e apos pausa', async () => {
    const first = await createMessenger(10);
    const second = await createMessenger(20, ['quero']);
    await repo.setStatus(scope, first.id, 1, 'ACTIVE');
    await repo.setStatus(scope, second.id, 1, 'ACTIVE');
    await Promise.all(
      Array.from({ length: 8 }, () => repo.ingest(first.event))
    );
    expect(await db.automationEvent.count({ where: { integrationId } })).toBe(
      1
    );
    expect(
      await db.automationDispatch.count({
        where: { flowId: { in: [first.id, second.id] } },
      })
    ).toBe(1);
    expect((await repo.history(scope, second.id))[0].status).toBe(
      'SKIPPED_CONFLICT'
    );
    await repo.setStatus(scope, first.id, 2, 'PAUSED');
    expect(await repo.ingest(first.event)).toEqual([]);
    expect(
      await db.automationDispatch.count({
        where: { flowId: { in: [first.id, second.id] } },
      })
    ).toBe(1);
  });
  it('Messenger serializa ativacoes de regras iguais e prioridades iguais', async () => {
    const a = await createMessenger(10);
    const b = await createMessenger(20, [' LINK ']);
    const results = await Promise.allSettled([
      repo.setStatus(scope, a.id, 1, 'ACTIVE'),
      repo.setStatus(scope, b.id, 1, 'ACTIVE'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const activeFlow = await db.flow.findFirstOrThrow({
      where: { ...scope, status: 'ACTIVE' },
    });
    const priority = JSON.parse(
      (activeFlow.definition as any).nodes[0].data
    ).priority;
    const c = await createMessenger(priority, ['diferente']);
    await expect(repo.setStatus(scope, c.id, 1, 'ACTIVE')).rejects.toThrow(
      'MESSENGER_PRIORITY_CONFLICT'
    );
  });
  it('Messenger bloqueia outro perfil e deduplica globalmente apos trocar a conexao', async () => {
    const a = await createMessenger();
    await repo.setStatus(scope, a.id, 1, 'ACTIVE');
    await repo.ingest(a.event);
    const oldScope = scope;
    const org = await db.organization.create({
      data: { name: 'Outra organizacao' },
    });
    const profile = await db.profile.create({
      data: { organizationId: org.id, name: 'Outro', slug: randomUUID() },
    });
    scope = { organizationId: org.id, profileId: profile.id };
    const other = await db.integration.create({
      data: {
        ...scope,
        internalId: a.event.remoteAccountId,
        name: 'Duplicada',
        providerIdentifier: 'facebook',
        type: 'social',
        token: 'FIXTURE',
      },
    });
    integrationId = other.id;
    const b = await createMessenger(20);
    await expect(repo.setStatus(scope, b.id, 1, 'ACTIVE')).rejects.toThrow(
      'MESSENGER_PAGE_IN_USE'
    );
    await repo.setStatus(oldScope, a.id, 2, 'PAUSED');
    await repo.setStatus(scope, b.id, 1, 'ACTIVE');
    expect(await repo.ingest(b.event)).toEqual([]);
    expect(await db.automationDispatch.count({ where: { flowId: b.id } })).toBe(
      0
    );
  });
  it('Messenger consome reentrega sem guardar conteudo sem correspondencia', async () => {
    const a = await createMessenger();
    await repo.setStatus(scope, a.id, 1, 'ACTIVE');
    expect(
      await repo.ingest({ ...a.event, text: 'mensagem pessoal sem regra' })
    ).toEqual([]);
    const stored = await db.automationEvent.findFirstOrThrow({
      where: { integrationId, eventType: 'messenger_message' },
    });
    expect(stored.text).toBe('');
    expect(stored.externalActorId).toBe('');
    expect(await repo.ingest(a.event)).toEqual([]);
  });
  it('Messenger falha fechado em empate legado e nao despacha comentario para regra de mensagem', async () => {
    const a = await createMessenger(10);
    const b = await createMessenger(20, ['quero']);
    await repo.setStatus(scope, a.id, 1, 'ACTIVE');
    await repo.setStatus(scope, b.id, 1, 'ACTIVE');
    await db.flow.update({
      where: { id: b.id },
      data: {
        definition: JSON.parse(
          JSON.stringify(
            simpleDefinition({
              triggerType: 'messenger_message',
              priority: 10,
              keywords: ['quero'],
              message: 'B',
            })
          )
        ),
      },
    });
    expect(await repo.ingest(a.event)).toEqual([]);
    expect((await repo.history(scope, a.id))[0].status).toBe(
      'SKIPPED_CONFLICT'
    );
    expect((await repo.history(scope, b.id))[0].status).toBe(
      'SKIPPED_CONFLICT'
    );
    expect(
      await repo.ingest({
        ...a.event,
        eventType: 'comment_on_post',
        externalEventId: '777_888',
        externalPostId: `${a.event.remoteAccountId}_777`,
      })
    ).toEqual([]);
    expect(
      await db.automationDispatch.count({
        where: { flowId: { in: [a.id, b.id] } },
      })
    ).toBe(0);
  });
  it('Messenger reserva um unico efeito global e nunca reenvia resultado incerto', async () => {
    const a = await createMessenger();
    await repo.setStatus(scope, a.id, 1, 'ACTIVE');
    const [id] = await repo.ingest(a.event);
    const execution = await db.flowExecutionV2.findUniqueOrThrow({
      where: { id },
    });
    const action = {
      key: 'messenger_reply',
      kind: 'messenger_reply' as const,
      text: 'Oi',
      delaySeconds: 0,
    };
    const reserved = await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.reserveEffect(execution, a.event.externalEventId, action)
      )
    );
    expect(reserved.filter((item) => item.send)).toHaveLength(1);
    expect(reserved.filter((item) => item.status === 'UNKNOWN')).toHaveLength(
      4
    );
    expect(
      await repo.reserveEffect(
        { ...execution, id: randomUUID() },
        a.event.externalEventId,
        action
      )
    ).toMatchObject({ send: false, status: 'ALREADY_CONSUMED' });
  });
});
