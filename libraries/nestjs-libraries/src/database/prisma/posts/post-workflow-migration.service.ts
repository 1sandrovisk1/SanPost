import { Injectable, Logger } from '@nestjs/common';
import type { temporal } from '@temporalio/proto';
import { TypedSearchAttributes } from '@temporalio/common';
import { TemporalService } from 'nestjs-temporal-core';
import {
  PostWorkflowMigrationRepository,
  POST_MIGRATION_BATCH_SIZE,
} from './post-workflow-migration.repository';
import {
  postId as postIdSearchParam,
  organizationId as organizationIdSearchParam,
} from '@gitroom/nestjs-libraries/temporal/temporal.search.attribute';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';

type Event = temporal.api.history.v1.IHistoryEvent;
type Candidate = NonNullable<
  Awaited<ReturnType<PostWorkflowMigrationRepository['findCandidate']>>
>;
export const V112_MIGRATION_REASON =
  'multipost:v112:waiting-schedule-migration:v1';
const SAFETY_WINDOW = 30 * 60 * 1000;
type Outcome = 'migrated' | 'already-v112' | 'deferred';

@Injectable()
export class PostWorkflowMigrationService {
  private readonly logger = new Logger(PostWorkflowMigrationService.name);
  constructor(
    private readonly posts: PostWorkflowMigrationRepository,
    private readonly temporal: TemporalService
  ) {}

  async ensureMigrationWorkflow() {
    const client = this.temporal.client.getRawClient();
    if (!client) throw new Error('Temporal client unavailable');
    return client.workflow.start('migratePostWorkflowsV112', {
      workflowId: 'migrate-post-workflows-v112',
      taskQueue: 'main',
      args: [{}],
      workflowIdConflictPolicy: 'USE_EXISTING',
    });
  }

  async migrateBatch(cursor?: string) {
    const candidates = await this.posts.listCandidates(cursor);
    const result = {
      scanned: candidates.length,
      migrated: 0,
      deferred: 0,
      errors: 0,
      nextCursor:
        candidates.length === POST_MIGRATION_BATCH_SIZE
          ? candidates[candidates.length - 1].id
          : undefined,
    };
    for (const { id } of candidates) {
      try {
        const outcome = await this.migratePost(id);
        if (outcome === 'migrated') result.migrated++;
        if (outcome === 'deferred') {
          result.deferred++;
          this.logger.warn(
            `[v112-migration] post=${id} adiado: sem prova de espera segura ou alterado durante migracao`
          );
        }
      } catch (error) {
        result.errors++;
        this.logger.warn(
          `[v112-migration] post=${id} falhou; nova tentativa na proxima varredura: ${summarizeError(
            error
          )}`
        );
      }
    }
    if (result.migrated || result.deferred || result.errors)
      this.logger.log(`[v112-migration] ${JSON.stringify(result)}`);
    return result;
  }

  async migratePost(id: string): Promise<Outcome> {
    const post = await this.posts.findCandidate(id);
    if (!post) return 'deferred';
    const client = this.temporal.client.getRawClient();
    if (!client) throw new Error('Temporal client unavailable');
    const workflowId = `post_${post.id}`;
    const description = await client.workflow.getHandle(workflowId).describe();
    if (description.type === 'postWorkflowV112') return 'already-v112';
    if (!['postWorkflowV101', 'postWorkflowV102'].includes(description.type))
      return 'deferred';
    // Fixar o run: um reagendamento concorrente nunca pode ser terminado.
    const old = client.workflow.getHandle(workflowId, description.runId);
    const history = (await old.fetchHistory()).events || [];
    if (
      !this.sameInput(history, post) ||
      !this.onlyInitialRead(history) ||
      !this.sameSnapshot(history, post)
    )
      return 'deferred';
    if (description.status.name === 'RUNNING') {
      if (
        !this.waitingTimer(history, post) ||
        !this.unchanged(post, await this.posts.findCandidate(id)) ||
        post.publishDate.getTime() <= Date.now() + SAFETY_WINDOW
      )
        return 'deferred';
      await client.workflow.withDeadline(Date.now() + 10000, () =>
        old.terminate(V112_MIGRATION_REASON)
      );
    } else if (
      description.status.name !== 'TERMINATED' ||
      !this.terminatedByMigration(history)
    ) {
      return 'deferred';
    }
    // Historico FINAL inclui qualquer activity agendada durante a corrida.
    const final = (await old.fetchHistory()).events || [];
    if (
      !this.terminatedByMigration(final) ||
      !this.onlyInitialRead(final) ||
      !this.unchanged(post, await this.posts.findCandidate(id))
    )
      return 'deferred';
    const taskQueue = post.integration.providerIdentifier.startsWith('zernio-')
      ? 'main'
      : post.integration.providerIdentifier.split('-')[0].toLowerCase();
    const next = await client.workflow.start('postWorkflowV112', {
      workflowId,
      taskQueue: 'main',
      workflowIdConflictPolicy: 'USE_EXISTING',
      args: [
        { postId: post.id, organizationId: post.organizationId, taskQueue },
      ],
      typedSearchAttributes: new TypedSearchAttributes([
        { key: postIdSearchParam, value: post.id },
        { key: organizationIdSearchParam, value: post.organizationId },
      ]),
    });
    const nextDescription = await next.describe();
    const nextHistory = (await next.fetchHistory()).events || [];
    return nextDescription.type === 'postWorkflowV112' &&
      this.sameInput(nextHistory, post)
      ? 'migrated'
      : 'deferred';
  }

  private decode(payload?: temporal.api.common.v1.IPayload): unknown {
    try {
      return payload?.data
        ? JSON.parse(Buffer.from(payload.data).toString())
        : undefined;
    } catch {
      return undefined;
    }
  }

  private sameInput(events: Event[], post: Candidate) {
    const start = events.find(
      (e) => e.workflowExecutionStartedEventAttributes
    )?.workflowExecutionStartedEventAttributes;
    const input = this.decode(start?.input?.payloads?.[0]) as
      | { postId?: string; organizationId?: string; postNow?: boolean }
      | undefined;
    return (
      !!input &&
      input.postId === post.id &&
      input.organizationId === post.organizationId &&
      input.postNow !== true
    );
  }

  private onlyInitialRead(events: Event[]) {
    return events.every(
      (e) =>
        !e.activityTaskScheduledEventAttributes ||
        e.activityTaskScheduledEventAttributes.activityType?.name ===
          'getPostsList'
    );
  }

  private sameSnapshot(events: Event[], post: Candidate) {
    return events.some((e) => {
      const decoded = this.decode(
        e.activityTaskCompletedEventAttributes?.result?.payloads?.[0]
      );
      if (!Array.isArray(decoded)) return false;
      const snapshot = decoded[0];
      return (
        snapshot?.id === post.id &&
        snapshot.organizationId === post.organizationId &&
        snapshot.integration?.id === post.integrationId &&
        new Date(snapshot.publishDate).getTime() === post.publishDate.getTime()
      );
    });
  }

  private waitingTimer(events: Event[], post: Candidate) {
    return events.some((e) => {
      const timer = e.timerStartedEventAttributes;
      if (!timer || !e.eventTime) return false;
      if (
        events.some(
          (other) =>
            other.timerFiredEventAttributes?.timerId === timer.timerId ||
            other.timerCanceledEventAttributes?.timerId === timer.timerId
        )
      )
        return false;
      const time =
        Number(e.eventTime.seconds) * 1000 +
        Number(e.eventTime.nanos || 0) / 1e6;
      const duration =
        Number(timer.startToFireTimeout?.seconds || 0) * 1000 +
        Number(timer.startToFireTimeout?.nanos || 0) / 1e6;
      const deadline = time + duration;
      return (
        deadline > Date.now() + SAFETY_WINDOW &&
        Math.abs(deadline - post.publishDate.getTime()) < 5000
      );
    });
  }

  private terminatedByMigration(events: Event[]) {
    return (
      events.at(-1)?.workflowExecutionTerminatedEventAttributes?.reason ===
      V112_MIGRATION_REASON
    );
  }

  private unchanged(before: Candidate, after: Candidate | null) {
    return (
      !!after &&
      after.publishDate.getTime() > Date.now() &&
      before.integrationId === after.integrationId &&
      before.organizationId === after.organizationId &&
      before.publishDate.getTime() === after.publishDate.getTime() &&
      before.updatedAt?.getTime() === after.updatedAt?.getTime()
    );
  }
}
