import { legacyFlowScopeMatches, legacyFlowIntegrationSelect } from '../flows/legacy-flow-scope';
import type { DeferredNextCandidate } from '../../../dtos/flows/scheduled-post.dto';
import { syncScheduledTarget, scheduledPostReserved } from '../scheduled-automations/scheduled-posts.repository';
import { messengerRule, selectMessengerWinner } from './messenger-keywords';
import { HttpException, Injectable } from '@nestjs/common';
import { Prisma, FlowStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import type {
  CommentEvent,
  FlowScope,
  SaveFlowV2Dto,
} from '../../../dtos/flows/flow-v2.dto';
import {
  CommentAction,
  getTriggerType,
  CommentDefinition,
  planCommentActions,
} from './flow-definition';
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const active: Prisma.FlowWhereInput = {
  status: FlowStatus.ACTIVE,
  deletedAt: null,
};
const unfinished = ['PENDING', 'RUNNING', 'UNKNOWN'];
const platform = (provider: string) =>
  provider.startsWith('instagram') ? 'instagram' : 'facebook';
export interface ResolvedChannel {
  integrationId: string;
  platform: string;
  remoteAccountId: string;
  postMode: string;
  postIds: string[];
  scheduledPostId?: string;
}
@Injectable()
export class SharedFlowsRepository {
  constructor(private readonly db: PrismaService) {}
  private scope(scope: FlowScope) {
    if (!scope.organizationId || !scope.profileId)
      throw new HttpException('PROFILE_REQUIRED', 403);
    return { organizationId: scope.organizationId, profileId: scope.profileId };
  }
  list(scope: FlowScope) {
    this.scope(scope);
    return this.db.flow.findMany({
      where: { ...this.scope(scope), executionVersion: 2, deletedAt: null },
      include: { channels: true, scheduledTargets: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async get(scope: FlowScope, id: string) {
    const flow = await this.db.flow.findFirst({
      where: { ...this.scope(scope), id, executionVersion: 2, deletedAt: null },
      include: { channels: true, scheduledTargets: true },
    });
    if (!flow) throw new HttpException('FLOW_NOT_FOUND', 404);
    return flow;
  }
  channels(scope: FlowScope) {
    return this.db.integration.findMany({
      where: {
        ...this.scope(scope),
        providerIdentifier: {
          in: ['facebook', 'instagram', 'instagram-standalone'],
        },
        disabled: false,
        deletedAt: null,
        inBetweenSteps: false,
        clientProfile: { deletedAt: null },
      },
      select: {
        id: true,
        name: true,
        internalId: true,
        providerIdentifier: true,
        picture: true,
      },
    });
  }
  async integration(scope: FlowScope, id: string) {
    const row = await this.db.integration.findFirst({
      where: {
        ...this.scope(scope),
        id,
        disabled: false,
        deletedAt: null,
        inBetweenSteps: false,
        clientProfile: { deletedAt: null },
      },
    });
    if (
      !row ||
      !['facebook', 'instagram', 'instagram-standalone'].includes(
        row.providerIdentifier
      )
    )
      throw new HttpException('CHANNEL_NOT_FOUND', 404);
    return row;
  }
  private async lock(tx: Prisma.TransactionClient, key: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text AS locked`;
  }
  private async lockAccounts(
    tx: Prisma.TransactionClient,
    channels: Array<{ platform: string; remoteAccountId: string }>
  ) {
    for (const key of [
      ...new Set(
        channels.map((c) => `comment-flow:${c.platform}:${c.remoteAccountId}`)
      ),
    ].sort())
      await this.lock(tx, key);
  }
  async save(
    scope: FlowScope,
    input: SaveFlowV2Dto,
    channels: ResolvedChannel[],
    id?: string
  ) {
    this.scope(scope);
    return this.db.$transaction(async (tx) => {
      if (id) await this.lock(tx, `flow-v2:${id}`);
      const old = id
        ? await tx.flow.findFirst({
            where: { ...scope, id, executionVersion: 2, deletedAt: null },
            include: { channels: true, scheduledTargets: true },
          })
        : null;
      if (id && !old) throw new HttpException('FLOW_NOT_FOUND', 404);
      if (old && old.revision !== input.expectedRevision)
        throw new HttpException('REVISION_CONFLICT', 409);
      if (old?.status === 'ARCHIVED') throw new HttpException('FLOW_NOT_FOUND', 404);
      if (old?.status === 'ACTIVE') {
        await this.lockAccounts(tx, [...old.channels, ...channels]);
        await this.assertActiveChannels(tx, scope, old.id, channels, input.definition);
      }
      const data = {
        name: input.name.trim(),
        definition: json(input.definition),
      };
      const flow = old
        ? await tx.flow.update({
            where: { id },
            data: { ...data, revision: { increment: 1 } },
          })
        : await tx.flow.create({
            data: {
              ...scope,
              ...data,
              integrationId: channels[0].integrationId,
              definitionVersion: 2,
              executionVersion: 2,
            },
          });
      // Preserve channel identity and next-publication binding on equivalent edits.
      for (const channel of channels) {
        const { scheduledPostId } = channel;
        const c = { integrationId: channel.integrationId, platform: channel.platform, remoteAccountId: channel.remoteAccountId, postMode: channel.postMode, postIds: channel.postIds };
        const previous = old?.channels.find(p => p.integrationId === c.integrationId);
        const sameOrigin = previous && previous.platform === c.platform && previous.remoteAccountId === c.remoteAccountId && previous.postMode === c.postMode && JSON.stringify([...previous.postIds].sort()) === JSON.stringify([...c.postIds].sort()) && (c.postMode !== 'scheduled' || old?.scheduledTargets.find(t => t.integrationId === c.integrationId)?.postId === scheduledPostId);
        const boundary = sameOrigin ? previous.activatedAt : old?.status === 'ACTIVE' ? new Date() : null;
        await tx.flowChannel.upsert({
          where: { flowId_integrationId: { flowId: flow.id, integrationId: c.integrationId } },
          create: { ...c, flowId: flow.id, activatedAt: boundary },
          update: { ...c, activatedAt: boundary, boundPostId: sameOrigin ? previous.boundPostId : null },
        });
      }
      await tx.flowChannel.deleteMany({ where: { flowId: flow.id, integrationId: { notIn: channels.map(c => c.integrationId) } } });
      for (const c of channels) await syncScheduledTarget(tx, scope, flow.id, c.integrationId, c.postMode === 'scheduled' ? c.scheduledPostId : undefined);
      await tx.scheduledAutomationTarget.deleteMany({ where: { flowId: flow.id, integrationId: { notIn: channels.map(c => c.integrationId) } } });
      return flow.id;
    });
  }
  private async assertActiveChannels(tx: Prisma.TransactionClient, scope: FlowScope, id: string, channels: ResolvedChannel[], definition: CommentDefinition) {
        const messenger = getTriggerType(definition) === 'messenger_message';
        if (
          messenger &&
          (channels.length !== 1 ||
            channels[0].platform !== 'facebook' ||
            channels[0].postMode !== 'all' ||
            channels[0].postIds.length)
        )
          throw new HttpException('MESSENGER_FACEBOOK_ONLY', 400);
        for (const channel of channels) {
          const integration = await tx.integration.findFirst({
            where: {
              id: channel.integrationId,
              ...scope,
              disabled: false,
              deletedAt: null,
              inBetweenSteps: false,
              internalId: channel.remoteAccountId,
              clientProfile: { deletedAt: null },
            },
          });
          if (!integration) throw new HttpException('CHANNEL_NOT_FOUND', 412);
          if (messenger)
            await this.assertMessengerActivation(
              tx,
              scope,
              id,
              channel,
              definition
            );
          if (channel.platform === 'instagram') {
            const legacy = await tx.flow.findMany({
              where: {
                ...active,
                executionVersion: 1,
                integration: {
                  internalId: channel.remoteAccountId,
                  providerIdentifier: {
                    in: ['instagram', 'instagram-standalone'],
                  },
                },
              },
              include: { nodes: { where: { type: 'TRIGGER' } } },
            });
            const isComment = (f: (typeof legacy)[number]) =>
              !f.nodes.some(
                (n) =>
                  n.label === 'story_reply' ||
                  (() => {
                    try {
                      return JSON.parse(n.data).triggerType === 'story_reply';
                    } catch {
                      return false;
                    }
                  })()
              );
            const running = await tx.flowExecution.count({
              where: {
                status: { in: ['RUNNING', 'WAITING_POSTBACK'] },
                flow: {
                  executionVersion: 1,
                  integration: { internalId: channel.remoteAccountId },
                },
                OR: [
                  { triggerType: null },
                  { triggerType: { not: 'story_reply' } },
                ],
              },
            });
            if (legacy.some(isComment) || running)
              throw new HttpException('LEGACY_COMMENT_FLOW_ACTIVE', 409);
          }
        }
  }
  async setStatus(
    scope: FlowScope,
    id: string,
    expectedRevision: number,
    status: FlowStatus
  ) {
    this.scope(scope);
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, `flow-v2:${id}`);
      const flow = await tx.flow.findFirst({
        where: { ...scope, id, executionVersion: 2, deletedAt: null },
        include: { channels: true, scheduledTargets: true },
      });
      if (!flow) throw new HttpException('FLOW_NOT_FOUND', 404);
      if (flow.revision !== expectedRevision)
        throw new HttpException('REVISION_CONFLICT', 409);
      await this.lockAccounts(tx, flow.channels);
      if (status === 'ACTIVE') {
        await this.assertActiveChannels(tx, scope, id, flow.channels, flow.definition as unknown as CommentDefinition);
        await tx.flowChannel.updateMany({
          where: { flowId: id },
          data: { activatedAt: new Date() },
        });
      }
      await tx.flow.update({
        where: { id },
        data: {
          status,
          revision: { increment: 1 },
          ...(status === 'ARCHIVED' ? { deletedAt: new Date() } : {}),
        },
      });
      return id;
    });
  }
  /** Same remote-account lock as V2 activation. Includes duplicate integrations. */
  async activateLegacy(
    scope: { organizationId: string; profileId?: string },
    id: string
  ) {
    return this.db.$transaction(async (tx) => {
      const flow = await tx.flow.findFirst({
        where: { id, ...scope, executionVersion: 1, deletedAt: null },
        include: { integration: true, nodes: { where: { type: 'TRIGGER' } } },
      });
      if (!flow) throw new HttpException('FLOW_NOT_FOUND', 404);
      await this.lockAccounts(tx, [
        {
          platform: platform(flow.integration.providerIdentifier),
          remoteAccountId: flow.integration.internalId,
        },
      ]);
      const story = flow.nodes.some(
        (n) =>
          n.label === 'story_reply' ||
          (() => {
            try {
              return JSON.parse(n.data).triggerType === 'story_reply';
            } catch {
              return false;
            }
          })()
      );
      if (!story) {
        const count = await tx.flowChannel.count({
          where: {
            remoteAccountId: flow.integration.internalId,
            platform: 'instagram',
            flow: { ...active, executionVersion: 2 },
          },
        });
        const running = await tx.flowExecutionV2.count({
          where: {
            remoteAccountId: flow.integration.internalId,
            platform: 'instagram',
            status: { in: unfinished },
          },
        });
        if (count || running)
          throw new HttpException('SHARED_COMMENT_FLOW_ACTIVE', 409);
      }
      return tx.flow.update({ where: { id }, data: { status: 'ACTIVE' } });
    });
  }
  async bindLegacyNext(flowId: string, nodeId: string, data: Record<string, unknown>, mediaId: string, expected: { revision: number; updatedAt: string }) {
    return this.db.$transaction(async tx => {
      const flow = await tx.flow.findFirst({ where: { id: flowId, executionVersion: 1, ...active, revision: expected.revision, updatedAt: new Date(expected.updatedAt), triggerPostIds: null }, include: { nodes: { where: { id: nodeId, type: 'TRIGGER' } } } });
      const node = flow?.nodes[0];
      if (!flow || !node || JSON.parse(node.data || '{}').mode !== 'next_publication') return false;
      const bound = await tx.flow.updateMany({ where: { id: flowId, ...active, revision: expected.revision, updatedAt: flow.updatedAt, triggerPostIds: null }, data: { triggerPostIds: JSON.stringify([mediaId]), updatedAt: flow.updatedAt } });
      if (!bound.count) return false;
      const updated = await tx.flowNode.updateMany({ where: { id: nodeId, flowId, data: node.data }, data: { data: JSON.stringify(data) } });
      if (!updated.count) throw new HttpException('REVISION_CONFLICT', 409);
      return true;
    });
  }
  async admitLegacy(data: Prisma.FlowExecutionUncheckedCreateInput, guard?: { targetId: string; revision: number; updatedAt: string; externalPostId: string; kind?: 'next' }) {
    return this.db.$transaction(async (tx) => {
      const flow = await tx.flow.findUnique({
        where: { id: data.flowId },
        include: { integration: { select: legacyFlowIntegrationSelect } },
      });
      if (!legacyFlowScopeMatches(flow)) return null;
      await this.lockAccounts(tx, [
        { platform: 'instagram', remoteAccountId: flow.integration.internalId },
      ]);
      const current = await tx.flow.findFirst({
        where: { id: data.flowId, ...active, executionVersion: 1, OR: [{profileId:null}, {profile:{deletedAt:null}}] },
        include: { integration: { select: legacyFlowIntegrationSelect } },
      });
      if (!legacyFlowScopeMatches(current) || current.integrationId !== flow.integrationId) return null;
      if (guard && (current.revision !== guard.revision || current.updatedAt.toISOString() !== guard.updatedAt || (guard.kind === 'next' ? !JSON.parse(current.triggerPostIds || '[]').includes(guard.externalPostId) : !await tx.scheduledAutomationTarget.findFirst({ where: { id: guard.targetId, flowId: current.id, integrationId: current.integrationId, boundPostIds: { has: guard.externalPostId }, post: { organizationId: current.organizationId, profileId: current.profileId, integrationId: current.integrationId, deletedAt: null, state: 'PUBLISHED', parentPostId: null, intervalInDays: null } } })))) return null;
      const sharedActive = await tx.flowChannel.count({
        where: {
          platform: 'instagram',
          remoteAccountId: flow.integration.internalId,
          flow: { ...active, executionVersion: 2 },
        },
      });
      if (sharedActive) return null;
      if (data.igCommentId) {
        const consumed = await tx.automationEvent.count({
          where: {
            platform: 'instagram',
            remoteAccountId: flow.integration.internalId,
            externalEventId: data.igCommentId,
          },
        });
        if (consumed) return null;
        const previous = await tx.flowExecution.findFirst({
          where: { flowId: data.flowId, igCommentId: data.igCommentId },
        });
        if (previous) return null;
      }
      return tx.flowExecution.create({ data });
    });
  }
  private async assertMessengerActivation(
    tx: Prisma.TransactionClient,
    scope: FlowScope,
    flowId: string,
    channel: ResolvedChannel,
    definition: CommentDefinition
  ) {
    const rule = messengerRule(definition);
    const candidates = await tx.flowChannel.findMany({
      where: {
        platform: 'facebook',
        remoteAccountId: channel.remoteAccountId,
        flowId: { not: flowId },
        flow: { ...active, executionVersion: 2 },
      },
      include: { flow: true },
    });
    for (const candidate of candidates) {
      const other = candidate.flow.definition as unknown as CommentDefinition;
      if (getTriggerType(other) !== 'messenger_message') continue;
      if (
        candidate.integrationId !== channel.integrationId ||
        candidate.flow.organizationId !== scope.organizationId ||
        candidate.flow.profileId !== scope.profileId
      )
        throw new HttpException('MESSENGER_PAGE_IN_USE', 409);
      const otherRule = messengerRule(other);
      const message =
        rule.fingerprint === otherRule.fingerprint
          ? 'MESSENGER_RULE_CONFLICT'
          : rule.priority === otherRule.priority
          ? 'MESSENGER_PRIORITY_CONFLICT'
          : undefined;
      if (message)
        throw new HttpException(
          {
            message,
            conflictingFlowId: candidate.flowId,
            conflictingFlowName: candidate.flow.name,
          },
          409
        );
    }
  }

  /** Caller holds the same remote-account lock used by activation, across all profiles. */
  private async ingestMessenger(
    tx: Prisma.TransactionClient,
    event: CommentEvent
  ) {
    const all = await tx.flowChannel.findMany({
      where: {
        platform: 'facebook',
        remoteAccountId: event.remoteAccountId,
        flow: { ...active, executionVersion: 2 },
      },
      include: { flow: true },
    });
    const messenger = all.filter(
      (c) =>
        getTriggerType(c.flow.definition as unknown as CommentDefinition) ===
        'messenger_message'
    );
    const channels = messenger.filter(
      (c) =>
        c.integrationId === event.integrationId &&
        c.flow.organizationId === event.organizationId &&
        c.flow.profileId === event.profileId
    );
    if (!channels.length) return [];
    // Integration-scoped uniqueness is insufficient when a Page is reconnected in another profile.
    if (
      await tx.automationEvent.findFirst({
        where: {
          platform: event.platform,
          remoteAccountId: event.remoteAccountId,
          eventType: 'messenger_message',
          externalEventId: event.externalEventId,
        },
      })
    )
      return [];
    const eligible = channels.filter(
      (c) => c.activatedAt && event.occurredAt >= c.activatedAt.getTime()
    );
    let route: { winner?: string; skipped: string[] } = { skipped: [] };
    let conflict: string | undefined;
    try {
      if (messenger.some((c) => !channels.includes(c)))
        throw new Error('MESSENGER_PAGE_IN_USE');
      route = selectMessengerWinner(
        eligible.map((c) => ({
          id: c.flowId,
          definition: c.flow.definition as unknown as CommentDefinition,
        })),
        event.text
      );
    } catch (error) {
      conflict =
        error instanceof Error &&
        ['MESSENGER_PAGE_IN_USE', 'MESSENGER_PRIORITY_CONFLICT'].includes(
          error.message
        )
          ? error.message
          : 'INVALID_GRAPH';
    }
    const row = await tx.automationEvent.create({
      data: {
        ...event,
        eventType: 'messenger_message',
        text: route.winner && !conflict ? event.text : '',
        externalActorId: route.winner && !conflict ? event.externalActorId : '',
        actorName: undefined,
        occurredAt: new Date(event.occurredAt),
      },
    });
    const dispatched: string[] = [];
    for (const channel of eligible) {
      if (
        !conflict &&
        route.winner !== channel.flowId &&
        !route.skipped.includes(channel.flowId)
      )
        continue;
      const definition = channel.flow
        .definition as unknown as CommentDefinition;
      const skipped = !!conflict || route.winner !== channel.flowId;
      let actions: CommentAction[] = [];
      let planningError: string | undefined;
      if (!skipped) {
        try {
          actions = planCommentActions(definition, {
            text: event.text,
            actorName: event.actorName,
            commentId: event.externalEventId,
          });
        } catch {
          planningError = 'INVALID_MESSAGE';
        }
      }
      const status = skipped
        ? 'SKIPPED_CONFLICT'
        : planningError
        ? 'FAILED'
        : actions.length
        ? 'PENDING'
        : 'SKIPPED_CONDITION';
      const executionId = randomUUID();
      await tx.flowExecutionV2.create({
        data: {
          id: executionId,
          flowId: channel.flowId,
          channelId: channel.id,
          eventId: row.id,
          organizationId: event.organizationId,
          profileId: event.profileId,
          integrationId: event.integrationId,
          platform: event.platform,
          remoteAccountId: event.remoteAccountId,
          revision: channel.flow.revision,
          status,
          error:
            conflict ||
            planningError ||
            (skipped ? 'MESSENGER_HIGHER_PRIORITY' : undefined),
          completedAt: status === 'PENDING' ? undefined : new Date(),
          snapshot: json({
            definition,
            actions,
            channel: { ...channel, flow: undefined },
            event: skipped
              ? {
                  ...event,
                  text: '',
                  externalActorId: '',
                  actorName: undefined,
                }
              : event,
            routing: {
              winnerFlowId: route.winner,
              priority: JSON.parse(
                definition.nodes.find((n) => n.type === 'TRIGGER')!.data
              ).priority,
            },
          }),
        },
      });
      if (status === 'PENDING') {
        await tx.automationDispatch.create({
          data: {
            flowId: channel.flowId,
            channelId: channel.id,
            eventId: row.id,
            executionId,
          },
        });
        dispatched.push(executionId);
      }
    }
    return dispatched;
  }

  async ingest(event: CommentEvent, scheduled?: { flowId: string; targetId: string; revision: number; updatedAt: Date }, nextReplay?: DeferredNextCandidate[]) {
    this.scope(event);
    if (nextReplay && !nextReplay.some(c => c.executionVersion === 2)) return [];
    return this.db.$transaction(
      async (tx) => {
        await this.lockAccounts(tx, [event]);
        const owner = await tx.integration.findFirst({
          where: {
            id: event.integrationId,
            organizationId: event.organizationId,
            profileId: event.profileId,
            internalId: event.remoteAccountId,
            disabled: false,
            deletedAt: null,
            clientProfile: { deletedAt: null },
          },
        });
        if (!owner || platform(owner.providerIdentifier) !== event.platform)
          return [];
        if (event.eventType === 'messenger_message')
          return this.ingestMessenger(tx, event);
        const channels = await tx.flowChannel.findMany({
          where: {
            integrationId: event.integrationId,
            ...(nextReplay ? { postMode: 'next_publication' } : {}),
            flow: {
              ...active,
              executionVersion: 2,
              organizationId: event.organizationId,
              profileId: event.profileId,
              ...(nextReplay ? { OR: nextReplay.filter(c => c.executionVersion === 2).map(c => ({ id: c.id, revision: c.revision, updatedAt: new Date(c.updatedAt) })) } : {}),
              ...(scheduled ? { id: scheduled.flowId, revision: scheduled.revision, updatedAt: scheduled.updatedAt, scheduledTargets: { some: { id: scheduled.targetId, integrationId: event.integrationId, boundPostIds: { has: event.externalPostId }, post: { organizationId: event.organizationId, profileId: event.profileId, integrationId: event.integrationId, deletedAt: null, state: 'PUBLISHED', parentPostId: null, intervalInDays: null } } } } : {}),
            },
          },
          include: { flow: true },
          orderBy: { flowId: 'asc' },
        });
        if (!channels.length) return [];
        const existing = await tx.automationEvent.findUnique({
          where: {
            integrationId_eventType_externalEventId: {
              integrationId: event.integrationId,
              eventType: 'comment_on_post',
              externalEventId: event.externalEventId,
            },
          },
        });
        if (existing && !scheduled && !nextReplay) return []; // Only a captured scheduled target may resume.
        const row = existing || await tx.automationEvent.create({
          data: {
            organizationId: event.organizationId, profileId: event.profileId, integrationId: event.integrationId, platform: event.platform, remoteAccountId: event.remoteAccountId, externalEventId: event.externalEventId, externalPostId: event.externalPostId, externalActorId: event.externalActorId, text: event.text,
            actorName: event.actorName?.slice(0, 200),
            eventType: 'comment_on_post',
            occurredAt: new Date(event.occurredAt),
          },
        });
        const exactReserved = channels.some(c => c.postMode === 'next_publication') && await scheduledPostReserved(tx, event.integrationId, event.externalPostId, false);
        const pendingReservation = channels.some(c => c.postMode === 'next_publication' && !c.boundPostId) && await scheduledPostReserved(tx, event.integrationId, event.externalPostId);
        const result: string[] = [];
        for (const channel of channels) {
          if (channel.postMode === 'next_publication' && (exactReserved || (!channel.boundPostId && pendingReservation))) continue;
          if (channel.postMode === 'scheduled' && !scheduled) continue;
          if (scheduled && channel.postMode !== 'scheduled') continue;
          if ((scheduled || nextReplay) && await tx.automationDispatch.findUnique({ where: { flowId_channelId_eventId: { flowId: channel.flowId, channelId: channel.id, eventId: row.id } } })) continue;
          if (
            getTriggerType(
              channel.flow.definition as unknown as CommentDefinition
            ) === 'messenger_message'
          )
            continue;
          if (
            !channel.activatedAt ||
            event.occurredAt < channel.activatedAt.getTime()
          )
            continue;
          if (
            channel.postMode === 'specific' &&
            !channel.postIds.includes(event.externalPostId)
          )
            continue;
          if (
            channel.postMode === 'next_publication' &&
            channel.boundPostId &&
            channel.boundPostId !== event.externalPostId
          )
            continue;
          const definition = channel.flow
            .definition as unknown as CommentDefinition;
          let actions: CommentAction[];
          try {
            actions = planCommentActions(
              definition,
              {
                text: event.text,
                actorName: event.actorName,
                commentId: event.externalEventId,
                postId: event.externalPostId,
              },
              (count) => randomInt(count)
            );
          } catch {
            actions = [];
          }
          if (!actions.length) continue;
          if (channel.postMode === 'next_publication' && !channel.boundPostId)
            await tx.flowChannel.update({
              where: { id: channel.id },
              data: { boundPostId: event.externalPostId },
            });
          const executionId = randomUUID();
          await tx.flowExecutionV2.create({
            data: {
              id: executionId,
              flowId: channel.flowId,
              channelId: channel.id,
              eventId: row.id,
              organizationId: event.organizationId,
              profileId: event.profileId,
              integrationId: event.integrationId,
              platform: event.platform,
              remoteAccountId: event.remoteAccountId,
              revision: channel.flow.revision,
              snapshot: json({
                definition,
                actions,
                channel: { ...channel, flow: undefined },
                event,
              }),
            },
          });
          await tx.automationDispatch.create({
            data: {
              flowId: channel.flowId,
              channelId: channel.id,
              eventId: row.id,
              executionId,
            },
          });
          result.push(executionId);
        }
        return result;
      },
      { timeout: 15000 }
    );
  }
  pendingDispatches() {
    return this.db.automationDispatch.findMany({
      where: { state: 'PENDING' },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });
  }
  dispatched(id: string) {
    return this.db.automationDispatch.update({
      where: { id },
      data: { state: 'STARTED' },
    });
  }
  execution(id: string) {
    return this.db.flowExecutionV2.findUnique({
      where: { id },
      include: { flow: true },
    });
  }
  finish(id: string, status: string, error?: string) {
    return this.db.flowExecutionV2.update({
      where: { id },
      data: { status, error, completedAt: new Date() },
    });
  }
  running(id: string) {
    return this.db.flowExecutionV2.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'RUNNING' },
    });
  }
  previousDelivery(executionId: string, actionKey: string) {
    return this.db.flowDelivery.findUnique({
      where: { executionId_actionKey: { executionId, actionKey } },
    });
  }
  async reserveEffect(
    execution: {
      id: string;
      platform: string;
      remoteAccountId: string;
      flowId: string;
      revision: number;
    },
    commentId: string,
    action: CommentAction
  ) {
    const effectKey = createHash('sha256')
      .update(
        JSON.stringify([
          execution.platform,
          execution.remoteAccountId,
          commentId,
          action.kind !== 'public_reply'
            ? action.kind
            : `${execution.id}:${action.key}`,
        ])
      )
      .digest('hex');
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, `effect:${effectKey}`);
      const existing = await tx.flowDelivery.findUnique({
        where: { effectKey },
      });
      if (existing)
        return {
          send: false,
          status:
            existing.executionId !== execution.id
              ? 'ALREADY_CONSUMED'
              : existing.status === 'SENDING'
              ? 'UNKNOWN'
              : existing.status,
          id: existing.id,
        };
      await this.lock(tx, `flow-v2:${execution.flowId}`);
      const flow = await tx.flow.findFirst({
        where: {
          id: execution.flowId,
          ...active,
          executionVersion: 2,
          revision: execution.revision,
        },
      });
      if (!flow) return { send: false, status: 'CANCELLED', id: '' };
      const row = await tx.flowDelivery.create({
        data: { executionId: execution.id, actionKey: action.key, effectKey },
      });
      return { send: true, status: 'SENDING', id: row.id };
    });
  }
  delivered(
    id: string,
    result: { status: string; remoteId?: string; error?: string }
  ) {
    return this.db.flowDelivery.update({ where: { id }, data: result });
  }
  async history(scope: FlowScope, id: string) {
    await this.get(scope, id);
    return this.db.flowExecutionV2.findMany({
      where: { ...this.scope(scope), flowId: id },
      take: 100,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        remoteAccountId: true,
        status: true,
        error: true,
        createdAt: true,
        completedAt: true,
        deliveries: {
          select: {
            actionKey: true,
            status: true,
            remoteId: true,
            error: true,
          },
        },
      },
    });
  }
  async bindNext(integrationId: string, postId: string, internalPostId?: string) {
    const row = await this.db.integration.findUnique({
      where: { id: integrationId },
      select: { internalId: true, providerIdentifier: true },
    });
    if (!row) return;
    await this.db.$transaction(async (tx) => {
      await this.lockAccounts(tx, [
        {
          platform: platform(row.providerIdentifier),
          remoteAccountId: row.internalId,
        },
      ]);
      if (await scheduledPostReserved(tx, integrationId, postId, !internalPostId, internalPostId)) return;
      await tx.flowChannel.updateMany({
        where: {
          integrationId,
          postMode: 'next_publication',
          boundPostId: null,
          flow: { ...active, executionVersion: 2 },
        },
        data: { boundPostId: postId },
      });
    });
  }
}
