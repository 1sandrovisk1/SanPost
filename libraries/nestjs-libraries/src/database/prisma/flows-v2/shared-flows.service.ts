import { ScheduledPostsService } from '../scheduled-automations/scheduled-posts.service';
import { HttpException, Injectable, Optional } from '@nestjs/common';
import {
  SharedFlowsRepository,
  ResolvedChannel,
} from './shared-flows.repository';
import { CommentChannelService } from '../../../integrations/automations/comment-channel.service';
import {
  normalizeDefinition,
  getTriggerType,
  CommentDefinition,
  CommentAction,
} from './flow-definition';
import type {
  CommentEvent,
  FlowScope,
  SaveFlowV2Dto,
  SharedFlowView,
} from '../../../dtos/flows/flow-v2.dto';
@Injectable()
export class SharedFlowsService {
  constructor(
    private readonly repository: SharedFlowsRepository,
    private readonly channels: CommentChannelService,
    @Optional() private readonly scheduled?: ScheduledPostsService
  ) {}
  enabled() {
    return process.env.SHARED_AUTOMATIONS_ENABLED === 'true';
  }
  private async view(
    scope: FlowScope,
    row: Awaited<ReturnType<SharedFlowsRepository['get']>>
  ): Promise<SharedFlowView> {
    const available = await this.repository.channels(scope);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      revision: row.revision,
      executionVersion: row.executionVersion,
      definition: row.definition as unknown as SharedFlowView['definition'],
      channels: row.channels.map((c) => ({
        id: c.id,
        integrationId: c.integrationId,
        platform: c.platform,
        remoteAccountId: c.remoteAccountId,
        postMode: c.postMode as SharedFlowView['channels'][number]['postMode'],
        scheduledPostId: row.scheduledTargets?.find(t => t.integrationId === c.integrationId)?.postId,
        postIds: c.postIds,
        boundPostId: c.boundPostId,
        name:
          available.find((i) => i.id === c.integrationId)?.name ||
          c.remoteAccountId,
      })),
    };
  }
  async list(scope: FlowScope) {
    return Promise.all(
      (await this.repository.list(scope)).map((row) => this.view(scope, row))
    );
  }
  async get(scope: FlowScope, id: string) {
    return this.view(scope, await this.repository.get(scope, id));
  }
  listChannels(scope: FlowScope) {
    return this.repository.channels(scope);
  }
  posts(scope: FlowScope, id: string, cursor?: string) {
    return this.channels.posts(scope, id, cursor);
  }
  resolvePost(scope: FlowScope, id: string, reference: string) {
    return this.channels.resolvePost(scope, id, reference);
  }
  readiness(scope: FlowScope, id: string, triggerType?: string) {
    if (
      triggerType &&
      !['comment_on_post', 'messenger_message'].includes(triggerType)
    )
      throw new HttpException('UNSUPPORTED_TRIGGER', 400);
    return triggerType === 'messenger_message'
      ? this.channels.readiness(scope, id, triggerType)
      : this.channels.readiness(scope, id);
  }
  activateMessenger(scope: FlowScope, id: string) {
    return this.channels.activateMessenger(scope, id);
  }
  async save(scope: FlowScope, input: SaveFlowV2Dto, id?: string) {
    if (
      !input.name?.trim() ||
      input.name.length > 200 ||
      !Array.isArray(input.channels) ||
      !input.channels.length ||
      input.channels.length > 2
    )
      throw new HttpException('INVALID_FLOW', 400);
    if (id && !Number.isInteger(input.expectedRevision))
      throw new HttpException('REVISION_REQUIRED', 400);
    try {
      input.definition = normalizeDefinition(input.definition);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'INVALID_GRAPH',
        400
      );
    }
    const messenger = getTriggerType(input.definition) === 'messenger_message';
    if (messenger && input.channels.length !== 1)
      throw new HttpException('MESSENGER_FACEBOOK_ONLY', 400);
    const resolved: ResolvedChannel[] = [];
    for (const channel of input.channels) {
      const integration = await this.repository.integration(
        scope,
        channel.integrationId
      );
      const platform =
        integration.providerIdentifier === 'facebook'
          ? 'facebook'
          : 'instagram';
      if (messenger && platform !== 'facebook')
        throw new HttpException('MESSENGER_FACEBOOK_ONLY', 400);
      if (messenger && (channel.postMode !== 'all' || channel.postIds?.length))
        throw new HttpException('MESSENGER_POST_TARGET_UNSUPPORTED', 400);
      if (resolved.some((c) => c.platform === platform))
        throw new HttpException('ONE_CHANNEL_PER_PLATFORM', 400);
      if (
        !['all', 'specific', 'next_publication', 'scheduled'].includes(channel.postMode) ||
        !Array.isArray(channel.postIds) ||
        channel.postIds.length > 100 ||
        channel.postIds.some(
          (p) => typeof p !== 'string' || !/^\d+(?:_\d+)?$/.test(p)
        ) ||
        (channel.postMode === 'specific'
          ? !channel.postIds.length
          : channel.postIds.length > 0)
      )
        throw new HttpException('INVALID_POST_SELECTION', 400);
      if (channel.postMode === 'scheduled' && !this.scheduled) throw new HttpException('SCHEDULED_POST_UNAVAILABLE', 412);
      await this.scheduled?.validateMode(scope, channel.integrationId, { ...channel, triggerType: messenger ? 'messenger_message' : 'comment_on_post' }, id);
      resolved.push({
        integrationId: channel.integrationId,
        postMode: channel.postMode,
        postIds: channel.postIds,
        scheduledPostId: channel.scheduledPostId,
        platform,
        remoteAccountId: integration.internalId,
      });
    }
    if (id) {
      const current = await this.repository.get(scope, id);
      if (current.revision !== input.expectedRevision) throw new HttpException('REVISION_CONFLICT', 409);
      if (current.status === 'ACTIVE') await this.assertActivation(scope, resolved, input.definition);
    }
    // Remote ownership is checked on activation; drafts can be saved while reconnecting.
    return this.get(
      scope,
      await this.repository.save(scope, input, resolved, id)
    );
  }
  private async assertActivation(scope: FlowScope, channels: Array<{ integrationId: string; postIds: string[] }>, definition: CommentDefinition) {
      if (!this.enabled())
        throw new HttpException('SHARED_WORKER_NOT_ENABLED', 412);
      for (const channel of channels) {
        if (
          process.env.SHARED_AUTOMATION_TEST_INTEGRATION &&
          channel.integrationId !==
            process.env.SHARED_AUTOMATION_TEST_INTEGRATION
        )
          throw new HttpException('LOCAL_TEST_CHANNEL_ONLY', 412);
        const messenger =
          getTriggerType(definition) ===
          'messenger_message';
        const ready = messenger
          ? await this.channels.readiness(
              scope,
              channel.integrationId,
              'messenger_message'
            )
          : await this.channels.readiness(scope, channel.integrationId);
        if (!ready.ready)
          throw new HttpException(
            { message: ready.reason, integrationId: channel.integrationId },
            412
          );
        for (const post of channel.postIds)
          await this.channels.assertPost(scope, channel.integrationId, post);
      }
  }
  async status(
    scope: FlowScope,
    id: string,
    expectedRevision: number,
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
  ) {
    const flow = await this.repository.get(scope, id);
    if (flow.revision !== expectedRevision)
      throw new HttpException('REVISION_CONFLICT', 409);
    if (status === 'ACTIVE') {
      for (const channel of flow.channels) {
        if (channel.postMode === 'scheduled') {
          const postId = flow.scheduledTargets?.find(t => t.integrationId === channel.integrationId)?.postId;
          await this.scheduled!.validateMode(scope, channel.integrationId, { postMode: 'scheduled', scheduledPostId: postId }, id);
        }
      }
      await this.assertActivation(scope, flow.channels, flow.definition as unknown as CommentDefinition);
    }
    await this.repository.setStatus(scope, id, expectedRevision, status);
    return status === 'ARCHIVED' ? { deleted: true } : this.get(scope, id);
  }
  history(scope: FlowScope, id: string) {
    return this.repository.history(scope, id);
  }
  async startExecution(id: string) {
    const execution = await this.repository.execution(id);
    if (
      !execution ||
      execution.flow.status !== 'ACTIVE' ||
      execution.flow.revision !== execution.revision ||
      execution.flow.deletedAt
    )
      return null;
    await this.repository.running(id);
    return (
      execution.snapshot as unknown as { actions: CommentAction[] }
    ).actions.map((a) => ({ key: a.key, delaySeconds: a.delaySeconds }));
  }
  async deliver(id: string, actionKey: string): Promise<string> {
    const execution = await this.repository.execution(id);
    if (
      !execution ||
      execution.flow.status !== 'ACTIVE' ||
      execution.flow.revision !== execution.revision ||
      execution.flow.deletedAt
    )
      return 'CANCELLED';
    const snapshot = execution.snapshot as unknown as {
      event: CommentEvent;
      actions: CommentAction[];
    };
    const action = snapshot.actions.find((a) => a.key === actionKey);
    if (!action) return 'FAILED';
    const previous = await this.repository.previousDelivery(id, actionKey);
    if (previous)
      return previous.status === 'SENDING' ? 'UNKNOWN' : previous.status;
    try {
      const send = await this.channels.prepare(
        execution,
        execution.integrationId,
        snapshot.event,
        action
      );
      const reservation = await this.repository.reserveEffect(
        execution,
        snapshot.event.externalEventId,
        action
      );
      if (!reservation.send) return reservation.status;
      const result = await send();
      await this.repository.delivered(reservation.id, {
        status: result.status,
        ...(result.status === 'SENT'
          ? { remoteId: result.remoteId }
          : { error: JSON.stringify(result.error) }),
      });
      return result.status;
    } catch (error) {
      // No raw Graph errors/tokens enter Temporal or the UI. An acquired reservation
      // remains SENDING if persistence failed after HTTP: a retry resolves UNKNOWN.
      return error instanceof HttpException
        ? String(error.getResponse()).slice(0, 100)
        : 'UNKNOWN';
    }
  }
  finish(id: string, status: string, error?: string) {
    return this.repository.finish(id, status, error);
  }
}
