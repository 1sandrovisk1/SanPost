import { HttpException, Injectable } from '@nestjs/common';
import type { FlowNodeDto, FlowEdgeDto } from '../../../dtos/flows/flow.dto';
import { Prisma, Post, FlowNode, FlowEdge } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { FlowScope, CommentEvent } from '../../../dtos/flows/flow-v2.dto';
import type {
  DeferredNextCandidate,
  ScheduledAutomationPostView,
  ScheduledAutomationPostsView,
} from '../../../dtos/flows/scheduled-post.dto';
export function eligibleScheduledPost(
  post: Pick<
    Post,
    | 'organizationId'
    | 'profileId'
    | 'integrationId'
    | 'deletedAt'
    | 'parentPostId'
    | 'intervalInDays'
    | 'settings'
    | 'state'
  > | null,
  scope: FlowScope,
  integrationId: string
) {
  if (
    !post ||
    post.organizationId !== scope.organizationId ||
    post.profileId !== scope.profileId ||
    post.integrationId !== integrationId ||
    post.deletedAt ||
    post.parentPostId ||
    post.intervalInDays ||
    !['QUEUE', 'PUBLISHED'].includes(post.state)
  )
    return false;
  try {
    return JSON.parse(post.settings || '{}').post_type !== 'story';
  } catch {
    return false;
  }
}
const scopeWhere = (scope: FlowScope) => {
  if (!scope.organizationId || !scope.profileId)
    throw new HttpException('PROFILE_REQUIRED', 403);
  return { organizationId: scope.organizationId, profileId: scope.profileId };
};
function previewMedia(image: string | null) {
  try {
    const first = JSON.parse(image || '[]')?.[0];
    const safe = (url: unknown): url is string => typeof url === 'string' && (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url));
    if (!safe(first?.path)) return {};
    const video = /\.(mp4|mov|webm)(?:[?#]|$)/i.test(first.path);
    return { mediaUrl: first.path, mediaType: video ? 'VIDEO' : 'IMAGE', ...(safe(first.thumbnail) ? { thumbnailUrl: first.thumbnail } : !video ? { thumbnailUrl: first.path } : {}) };
  } catch { return {}; }
}
const view = (p: Post): ScheduledAutomationPostView => ({
  id: p.id,
  ...previewMedia(p.image),
  caption: p.content.replace(/<[^>]*>/g, '').slice(0, 500),
  publishDate: p.publishDate.toISOString(),
  state: p.state,
  status:
    p.deletedAt || p.state === 'DRAFT'
      ? 'cancelled'
      : p.state === 'ERROR'
      ? 'failed'
      : !eligibleScheduledPost(
          p,
          { organizationId: p.organizationId, profileId: p.profileId || '' },
          p.integrationId
        )
      ? 'unavailable'
      : p.state === 'PUBLISHED'
      ? 'published'
      : 'waiting',
});
/** Exact reservations take precedence; unresolved published IDs defer a lazy next bind. */
export async function scheduledPostReserved(tx: Pick<Prisma.TransactionClient, 'scheduledAutomationTarget'>, integrationId: string, remotePostId: string, pendingNext = true, internalPostId?: string) {
  return !!await tx.scheduledAutomationTarget.findFirst({
    where: {
      integrationId,
      flow: { status: 'ACTIVE', deletedAt: null },
      post: { integrationId, deletedAt: null, state: { in: ['QUEUE', 'PUBLISHED'] }, parentPostId: null, intervalInDays: null },
      OR: [
        ...(internalPostId ? [{ postId: internalPostId }] : []),
        { boundPostIds: { has: remotePostId } },
        { publishedReleaseId: remotePostId },
        { post: { releaseId: remotePostId } },
        ...(pendingNext ? [{ boundPostIds: { equals: [] as string[] }, post: { OR: [{ state: 'PUBLISHED' as const, releaseId: { not: null } }, { state: 'QUEUE' as const, publishDate: { lte: new Date(Date.now() + 60000) } }] } }] : []),
      ],
    },
    select: { id: true },
  });
}
/** Used inside the same save transaction by both engines. */
export async function syncScheduledTarget(
  tx: Prisma.TransactionClient,
  scope: FlowScope,
  flowId: string,
  integrationId: string,
  postId?: string
) {
  const where = { flowId_integrationId: { flowId, integrationId } };
  const old = await tx.scheduledAutomationTarget.findUnique({ where });
  if (!postId) {
    if (old) await tx.scheduledAutomationTarget.delete({ where });
    return;
  }
  const sc = scopeWhere(scope);
  // Serialize target creation with the publisher's Post.update row lock.
  await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${postId} AND "organizationId" = ${sc.organizationId} AND "profileId" = ${sc.profileId} AND "integrationId" = ${integrationId} FOR UPDATE`;
  const post = await tx.post.findFirst({
    where: { id: postId, ...sc, integrationId },
  });
  if (
    !eligibleScheduledPost(post, scope, integrationId) ||
    (old?.postId !== postId && (post!.state !== 'QUEUE' || !!post!.releaseId))
  )
    throw new HttpException('SCHEDULED_POST_UNAVAILABLE', 412);
  if (old?.postId === postId) return;
  if (old) await tx.scheduledAutomationTarget.delete({ where });
  await tx.scheduledAutomationTarget.create({
    data: { flowId, integrationId, postId },
  });
}
@Injectable()
export class ScheduledPostsRepository {
  constructor(private readonly db: PrismaService) {}
  isReserved(integrationId: string, remotePostId: string, pendingNext = true, internalPostId?: string) {
    return scheduledPostReserved(this.db, integrationId, remotePostId, pendingNext, internalPostId);
  }
  async nextCandidates(scope: FlowScope, integrationId: string, occurredAt: number): Promise<DeferredNextCandidate[]> {
    const rows = await this.db.flow.findMany({
      where: { ...scopeWhere(scope), status: 'ACTIVE', deletedAt: null, updatedAt: { lte: new Date(occurredAt) }, OR: [ { executionVersion: 2, channels: { some: { integrationId, postMode: 'next_publication', boundPostId: null } } }, { executionVersion: 1, integrationId, triggerPostIds: null, nodes: { some: { type: 'TRIGGER', data: { contains: 'next_publication' } } } } ] },
      include: { nodes: { where: { type: 'TRIGGER' } } },
    });
    return (rows || []).filter(f => f.executionVersion === 2 || f.nodes.some(n => { try { return JSON.parse(n.data).mode === 'next_publication'; } catch { return false; } })).map(f => ({ id: f.id, revision: f.revision, updatedAt: f.updatedAt.toISOString(), executionVersion: f.executionVersion }));
  }
  async unresolvedForNext() {
    const pending = await this.db.flow.findMany({ where: { status: 'ACTIVE', deletedAt: null, OR: [ { executionVersion: 2, channels: { some: { postMode: 'next_publication', boundPostId: null } } }, { executionVersion: 1, triggerPostIds: null, nodes: { some: { type: 'TRIGGER', data: { contains: 'next_publication' } } } } ] }, include: { channels: true, nodes: { where: { type: 'TRIGGER' } } } });
    const ids = (pending || []).flatMap(f => f.executionVersion === 2 ? f.channels.filter(c => c.postMode === 'next_publication' && !c.boundPostId).map(c => c.integrationId) : f.nodes.some(n => { try { return JSON.parse(n.data).mode === 'next_publication'; } catch { return false; } }) ? [f.integrationId] : []);
    if (!ids.length) return [];
    return this.db.scheduledAutomationTarget.findMany({
      where: { integrationId: { in: ids }, boundAt: null, flow: { status: 'ACTIVE', deletedAt: null }, post: { state: 'PUBLISHED', deletedAt: null, releaseId: { not: null } } },
      include: { flow: true, post: true }, take: 50,
    });
  }
  async post(scope: FlowScope, integrationId: string, id: string) {
    return this.db.post.findFirst({
      where: { id, ...scopeWhere(scope), integrationId },
    });
  }
  targetForFlow(scope: FlowScope, flowId: string, integrationId: string) {
    return this.db.scheduledAutomationTarget.findFirst({
      where: {
        flowId,
        integrationId,
        flow: { ...scopeWhere(scope), deletedAt: null },
      },
    });
  }
  async hasTarget(
    scope: FlowScope,
    flowId: string,
    integrationId: string,
    postId: string
  ) {
    return !!(await this.db.scheduledAutomationTarget.findFirst({
      where: {
        flowId,
        integrationId,
        postId,
        flow: { ...scopeWhere(scope), deletedAt: null },
      },
    }));
  }
  async list(
    scope: FlowScope,
    integrationId: string,
    cursor?: string,
    selectedId?: string
  ): Promise<ScheduledAutomationPostsView> {
    const sc = scopeWhere(scope);
    const integration = await this.db.integration.findFirst({
      where: {
        id: integrationId,
        ...sc,
        deletedAt: null,
        disabled: false,
        providerIdentifier: { in: ['facebook', 'instagram'] },
      },
      select: { id: true },
    });
    if (!integration) throw new HttpException('CHANNEL_NOT_FOUND', 404);
    if (cursor && !/^[a-zA-Z0-9-]{1,80}$/.test(cursor))
      throw new HttpException('INVALID_CURSOR', 400);
    const rows = await this.db.post.findMany({
      where: {
        ...sc,
        integrationId,
        state: 'QUEUE',
        releaseId: null,
        parentPostId: null,
        deletedAt: null,
        intervalInDays: null,
      },
      orderBy: { id: 'asc' },
      take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const selected = selectedId
      ? await this.post(scope, integrationId, selectedId)
      : null;
    const aliases = selected?.state === 'PUBLISHED' ? await this.db.scheduledAutomationTarget.findMany({ where: { postId: selected.id, integrationId, flow: { ...sc, deletedAt: null } }, select: { boundPostIds: true } }) : [];
    return {
      posts: rows
        .slice(0, 50)
        .filter((p) => eligibleScheduledPost(p, scope, integrationId))
        .map(view),
      nextCursor: rows.length > 50 ? rows[49].id : null,
      ...(selected ? { selected: { ...view(selected), publishedPostIds: [...new Set([...(aliases || []).flatMap(t => t.boundPostIds), ...(selected.releaseId && /^\d+(?:_\d+)?$/.test(selected.releaseId) ? [selected.releaseId] : [])])] } } : {}),
    };
  }
  sync(
    scope: FlowScope,
    flowId: string,
    integrationId: string,
    postId?: string
  ) {
    return this.db.$transaction(async (tx) => {
      if (
        !(await tx.flow.findFirst({
          where: {
            id: flowId,
            ...scopeWhere(scope),
            integrationId,
            deletedAt: null,
          },
        }))
      )
        throw new HttpException('FLOW_NOT_FOUND', 404);
      await syncScheduledTarget(tx, scope, flowId, integrationId, postId);
    });
  }
  async saveLegacyCanvas(
    scope: FlowScope,
    flowId: string,
    nodes: FlowNodeDto[],
    edges: FlowEdgeDto[],
    conditional?: { expectedUpdatedAt: string; name?: string }
  ) {
    return this.db.$transaction(async (tx) => {
      const flow = await tx.flow.findFirst({
        where: {
          id: flowId,
          ...scopeWhere(scope),
          executionVersion: 1,
          deletedAt: null,
        },
      });
      if (!flow) throw new HttpException('FLOW_NOT_FOUND', 404);
      if (conditional) {
        const claimed = await tx.flow.updateMany({
          where: { id: flowId, ...scopeWhere(scope), executionVersion: 1, deletedAt: null, updatedAt: new Date(conditional.expectedUpdatedAt) },
          data: { revision: { increment: 1 }, ...(conditional.name !== undefined ? { name: conditional.name } : {}) },
        });
        if (claimed.count !== 1) throw new HttpException('REVISION_CONFLICT', 409);
      }
      const trigger = nodes.find((n) => n.type === 'TRIGGER');
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(trigger?.data || '{}');
      } catch {
        throw new HttpException('INVALID_TRIGGER', 400);
      }
      const postId =
        config.mode === 'scheduled'
          ? String(config.scheduledPostId || '')
          : undefined;
      if (
        config.mode === 'scheduled' &&
        ((Array.isArray(config.postIds) && config.postIds.length) ||
          (Array.isArray(config.storyIds) && config.storyIds.length))
      )
        throw new HttpException('INVALID_SCHEDULED_SELECTION', 400);
      if (
        config.mode === 'scheduled' &&
        (trigger?.label === 'story_reply' ||
          config.triggerType === 'story_reply' ||
          !postId)
      )
        throw new HttpException('SCHEDULED_COMMENTS_ONLY', 400);
      await syncScheduledTarget(tx, scope, flow.id, flow.integrationId, postId);
      await tx.flowEdge.deleteMany({ where: { flowId } });
      await tx.flowNode.deleteMany({ where: { flowId } });
      const createdNodes: FlowNode[] = [];
      for (const node of nodes)
        createdNodes.push(
          await tx.flowNode.create({
            data: {
              flowId,
              type: node.type,
              label: node.label,
              data: node.data || '{}',
              positionX: node.positionX,
              positionY: node.positionY,
            },
          })
        );
      const ids = new Map(nodes.map((n, i) => [n.id, createdNodes[i].id]));
      const createdEdges: FlowEdge[] = [];
      for (const edge of edges)
        createdEdges.push(
          await tx.flowEdge.create({
            data: {
              flowId,
              sourceNodeId: ids.get(edge.sourceNodeId) || edge.sourceNodeId,
              targetNodeId: ids.get(edge.targetNodeId) || edge.targetNodeId,
              sourceHandle: edge.sourceHandle,
            },
          })
        );
      const remoteIds =
        config.mode === 'scheduled'
          ? []
          : Array.isArray(config.postIds)
          ? config.postIds
          : [];
      await tx.flow.update({
        where: { id: flowId },
        data: {
          triggerPostIds: remoteIds.length
            ? JSON.stringify([...new Set(remoteIds)])
            : null,
        },
      });
      return { nodes: createdNodes, edges: createdEdges };
    });
  }
  async cleanup() {
    const where = { expiresAt: { lt: new Date(Date.now() - 7 * 86400000) } };
    const [scheduled, next] = await Promise.all([this.db.scheduledAutomationEvent.deleteMany({ where }), this.db.deferredNextAutomationEvent.deleteMany({ where })]);
    return { count: (scheduled?.count || 0) + (next?.count || 0) };
  }

  async capture(event: CommentEvent) {
    if (
      event.eventType === 'messenger_message' ||
      !event.profileId ||
      !event.organizationId ||
      !Number.isFinite(event.occurredAt) ||
      event.occurredAt <= 0 ||
      event.occurredAt > Date.now() + 60000
    )
      return;
    const targets = await this.db.scheduledAutomationTarget.findMany({
      where: {
        integrationId: event.integrationId,
        createdAt: { lte: new Date(event.occurredAt) },
        flow: { ...scopeWhere(event), status: 'ACTIVE', deletedAt: null },
        post: {
          ...scopeWhere(event),
          integrationId: event.integrationId,
          deletedAt: null,
          OR: [{ state: 'PUBLISHED' }, { publishDate: { lte: new Date(event.occurredAt + 60000) } }],
        },
      },
      include: { flow: true, post: true },
    });
    const deferredNext = targets.length ? await this.nextCandidates(event, event.integrationId, event.occurredAt) : [];
    if (deferredNext.length) await this.db.deferredNextAutomationEvent.createMany({ data: [{ organizationId: event.organizationId, profileId: event.profileId, integrationId: event.integrationId, externalEventId: event.externalEventId, event: JSON.parse(JSON.stringify(event)), candidates: JSON.parse(JSON.stringify(deferredNext)), expiresAt: new Date(Date.now() + 86400000) }], skipDuplicates: true });
    for (const target of targets) {
      if (
        !eligibleScheduledPost(target.post, event, event.integrationId) ||
        target.flow.updatedAt.getTime() > event.occurredAt
      )
        continue;
      if (
        target.boundPostIds.length &&
        !target.boundPostIds.includes(event.externalPostId)
      )
        continue;
      await this.db.scheduledAutomationEvent.createMany({
        data: [
          {
            targetId: target.id,
            externalEventId: event.externalEventId,
            event: JSON.parse(JSON.stringify(event)),
            revision: target.flow.revision,
            flowUpdatedAt: target.flow.updatedAt,
            expiresAt: new Date(Date.now() + 24 * 3600000),
          },
        ],
        skipDuplicates: true,
      });
    }
  }
  async claim() {
    const now = new Date();
    const rows = await this.db.scheduledAutomationEvent.findMany({
      where: {
        state: 'PENDING',
        availableAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      orderBy: { availableAt: 'asc' },
      take: 50,
    });
    const claimed: typeof rows = [];
    for (const row of rows) {
      const lease = await this.db.scheduledAutomationEvent.updateMany({
        where: {
          id: row.id,
          state: 'PENDING',
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
        data: { leaseUntil: new Date(Date.now() + 120000) },
      });
      if (lease.count) claimed.push(row);
    }
    return claimed;
  }
  async claimDeferredNext() {
    const now = new Date();
    const rows = await this.db.deferredNextAutomationEvent.findMany({ where: { state: 'PENDING', availableAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, orderBy: { availableAt: 'asc' }, take: 50 });
    const claimed: typeof rows = [];
    for (const row of rows) {
      const lease = await this.db.deferredNextAutomationEvent.updateMany({ where: { id: row.id, state: 'PENDING', OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, data: { leaseUntil: new Date(Date.now() + 120000) } });
      if (lease.count) claimed.push(row);
    }
    return claimed;
  }
  finishDeferredNext(id: string, state: 'DONE' | 'SKIPPED' | 'PENDING') {
    return this.db.deferredNextAutomationEvent.update({ where: { id }, data: { state, leaseUntil: null, availableAt: new Date(Date.now() + 15000) } });
  }
  async validGuard(
    flowId: string,
    guard: {
      targetId: string;
      revision: number;
      updatedAt: string;
      externalPostId: string;
      kind?: 'next';
    }
  ) {
    if (guard.kind === 'next') {
      const flow = await this.db.flow.findFirst({ where: { id: flowId, executionVersion: 1, status: 'ACTIVE', deletedAt: null, revision: guard.revision, updatedAt: new Date(guard.updatedAt) }, select: { triggerPostIds: true } });
      try { return !!flow && JSON.parse(flow.triggerPostIds || '[]').includes(guard.externalPostId); } catch { return false; }
    }
    const target = await this.target(guard.targetId);
    return (
      !!target &&
      target.flowId === flowId &&
      target.flow.status === 'ACTIVE' &&
      !target.flow.deletedAt &&
      target.flow.revision === guard.revision &&
      target.flow.updatedAt.toISOString() === guard.updatedAt &&
      target.boundPostIds.includes(guard.externalPostId) &&
      target.post.state === 'PUBLISHED' &&
      eligibleScheduledPost(
        target.post,
        {
          organizationId: target.flow.organizationId,
          profileId: target.flow.profileId || '',
        },
        target.integrationId
      )
    );
  }
  target(id: string) {
    return this.db.scheduledAutomationTarget.findUnique({
      where: { id },
      include: { flow: true, post: true },
    });
  }
  integration(scope: FlowScope, id: string) {
    return this.db.integration.findFirst({
      where: {
        id,
        ...scopeWhere(scope),
        disabled: false,
        deletedAt: null,
        clientProfile: { deletedAt: null },
      },
      select: { internalId: true, providerIdentifier: true },
    });
  }
  bind(id: string, ids: string[]) {
    return this.db.scheduledAutomationTarget.updateMany({
      where: { id, boundAt: null },
      data: { boundPostIds: ids, boundAt: new Date() },
    });
  }
  finish(id: string, state: 'DONE' | 'SKIPPED' | 'PENDING') {
    return this.db.scheduledAutomationEvent.update({
      where: { id },
      data: {
        state,
        leaseUntil: null,
        availableAt: new Date(Date.now() + 15000),
      },
    });
  }
}
