import type { DeferredNextCandidate } from '../../dtos/flows/scheduled-post.dto';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ScheduledPostsService } from '../../database/prisma/scheduled-automations/scheduled-posts.service';
import { eligibleScheduledPost } from '../../database/prisma/scheduled-automations/scheduled-posts.repository';
import { FlowsService } from '../../database/prisma/flows/flows.service';
import { SharedFlowsRepository } from '../../database/prisma/flows-v2/shared-flows.repository';
import { CommentChannelService } from './comment-channel.service';
import type { CommentEvent } from '../../dtos/flows/flow-v2.dto';
@Injectable()
export class ScheduledAutomationProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private cleanedAt = 0;
  private readonly reservationAttempts = new Map<string, number>();
  private readonly logger = new Logger(ScheduledAutomationProcessor.name);
  constructor(
    private readonly scheduled: ScheduledPostsService,
    private readonly legacy: FlowsService,
    private readonly shared: SharedFlowsRepository,
    private readonly channels: CommentChannelService
  ) {}
  onApplicationBootstrap() {
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, 15000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    const repo = this.scheduled.repository;
    try {
      if (Date.now() - this.cleanedAt > 3600000) {
        await repo.cleanup();
        this.cleanedAt = Date.now();
      }
      // Resolve publication aliases even without a comment when a next rule is waiting.
      const unresolved = await repo.unresolvedForNext();
      const liveIds = new Set(unresolved.map(target => target.id));
      for (const id of this.reservationAttempts.keys()) if (!liveIds.has(id)) this.reservationAttempts.delete(id);
      for (const target of unresolved) {
        if ((this.reservationAttempts.get(target.id) || 0) > Date.now()) continue;
        this.reservationAttempts.set(target.id, Date.now() + 60000);
        try {
          const scope = { organizationId: target.flow.organizationId, profileId: target.flow.profileId || '' };
          if (!eligibleScheduledPost(target.post, scope, target.integrationId)) continue;
          const ids = await this.channels.scheduledPublishedIds(scope, target.integrationId, target.publishedReleaseId || target.post.releaseId!);
          if (ids.length) await repo.bind(target.id, ids);
        } catch { /* Keep next-publication deferred until ownership can be proved. */ }
      }
      for (const item of await repo.claimDeferredNext()) {
        try {
          const event = item.event as unknown as CommentEvent;
          const candidates = item.candidates as unknown as DeferredNextCandidate[];
          const integration = await repo.integration(item, item.integrationId);
          if (!integration || integration.internalId !== event.remoteAccountId || event.organizationId !== item.organizationId || event.profileId !== item.profileId || event.integrationId !== item.integrationId || item.expiresAt.getTime() <= Date.now() || (event.platform === 'facebook' ? integration.providerIdentifier !== 'facebook' : integration.providerIdentifier !== 'instagram')) { await repo.finishDeferredNext(item.id, 'SKIPPED'); continue; }
          if (await repo.isReserved(item.integrationId, event.externalPostId, false)) { await repo.finishDeferredNext(item.id, 'SKIPPED'); continue; }
          if (await repo.isReserved(item.integrationId, event.externalPostId)) { await repo.finishDeferredNext(item.id, 'PENDING'); continue; }
          if (candidates.some(c => c.executionVersion === 2) && process.env.SHARED_AUTOMATIONS_ENABLED !== 'true') { await repo.finishDeferredNext(item.id, 'PENDING'); continue; }
          if (process.env.SHARED_AUTOMATIONS_ENABLED === 'true') await this.shared.ingest(event, undefined, candidates);
          if (event.platform === 'instagram') await this.legacy.handleIncomingComment({ organizationId: event.organizationId, integrationId: event.integrationId, igCommentId: event.externalEventId, igCommenterId: event.externalActorId, igCommenterName: event.actorName, igMediaId: event.externalPostId, commentText: event.text, occurredAt: event.occurredAt }, undefined, undefined, candidates);
          await repo.finishDeferredNext(item.id, 'DONE');
        } catch { await repo.finishDeferredNext(item.id, 'PENDING'); }
      }
      for (const item of await repo.claim()) {
        try {
          const event = item.event as unknown as CommentEvent;
          const target = await repo.target(item.targetId);
          const integration =
            await repo.integration(event, event.integrationId);
          if (
            !target ||
            !integration ||
            integration.internalId !== event.remoteAccountId ||
            (event.platform === 'facebook'
              ? integration.providerIdentifier !== 'facebook'
              : integration.providerIdentifier !== 'instagram') ||
            target.flow.status !== 'ACTIVE' ||
            target.flow.deletedAt ||
            target.flow.organizationId !== event.organizationId ||
            target.flow.profileId !== event.profileId ||
            target.flow.revision !== item.revision ||
            target.flow.updatedAt.getTime() !== item.flowUpdatedAt.getTime() ||
            item.expiresAt.getTime() <= Date.now() ||
            !eligibleScheduledPost(target.post, event, target.integrationId)
          ) {
            await repo.finish(item.id, 'SKIPPED');
            continue;
          }
          if (
            target.flow.executionVersion === 2 &&
            process.env.SHARED_AUTOMATIONS_ENABLED !== 'true'
          ) {
            await repo.finish(item.id, 'PENDING');
            continue;
          }
          if (
            target.post.state !== 'PUBLISHED' ||
            !target.post.releaseId ||
            target.post.releaseId === 'missing'
          ) {
            await repo.finish(item.id, 'PENDING');
            continue;
          }
          let ids = target.boundPostIds;
          if (!ids.length) {
            ids = await this.channels.scheduledPublishedIds(
              event,
              target.integrationId,
              target.publishedReleaseId || target.post.releaseId
            );
            if (!ids.length) throw new Error('PUBLICATION_ID_PENDING');
            await repo.bind(target.id, ids);
            // Another worker may have frozen the first publication concurrently.
            ids = (await repo.target(target.id))?.boundPostIds || ids;
          }
          if (!ids.includes(event.externalPostId)) {
            await repo.finish(item.id, 'SKIPPED');
            continue;
          }
          if (target.flow.executionVersion === 2) {
            await this.shared.ingest(event, {
              flowId: target.flowId,
              targetId: target.id,
              revision: item.revision,
              updatedAt: item.flowUpdatedAt,
            });
          } else {
            await this.legacy.handleIncomingComment(
              {
                organizationId: event.organizationId,
                integrationId: event.integrationId,
                igCommentId: event.externalEventId,
                igCommenterId: event.externalActorId,
                igCommenterName: event.actorName,
                igMediaId: event.externalPostId,
                commentText: event.text,
              },
              target.flowId,
              {
                targetId: target.id,
                revision: item.revision,
                updatedAt: item.flowUpdatedAt.toISOString(),
                externalPostId: event.externalPostId,
              }
            );
          }
          await repo.finish(item.id, 'DONE');
        } catch {
          // Lease + stable execution/workflow IDs recover a crash or transient failure.
          await repo.finish(item.id, 'PENDING');
        }
      }
    } catch {
      this.logger.warn(
        'Scheduled automation reconciliation unavailable; events remain queued.'
      );
    } finally {
      this.busy = false;
    }
  }
}
