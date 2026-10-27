import { HttpException, Injectable } from '@nestjs/common';
import {
  ScheduledPostsRepository,
  eligibleScheduledPost,
} from './scheduled-posts.repository';
import type { FlowScope, CommentEvent } from '../../../dtos/flows/flow-v2.dto';
@Injectable()
export class ScheduledPostsService {
  constructor(readonly repository: ScheduledPostsRepository) {}
  list(
    scope: FlowScope,
    integrationId: string,
    cursor?: string,
    selectedId?: string
  ) {
    return this.repository.list(scope, integrationId, cursor, selectedId);
  }
  async assertSelection(
    scope: FlowScope,
    integrationId: string,
    postId: string,
    flowId?: string
  ) {
    const post = await this.repository.post(scope, integrationId, postId);
    const existing =
      flowId &&
      (await this.repository.hasTarget(scope, flowId, integrationId, postId));
    if (
      !eligibleScheduledPost(post, scope, integrationId) ||
      (!existing && (post!.state !== 'QUEUE' || !!post!.releaseId))
    )
      throw new HttpException('SCHEDULED_POST_UNAVAILABLE', 412);
  }
  async validateMode(
    scope: FlowScope,
    integrationId: string,
    input: {
      postMode?: string;
      scheduledPostId?: string;
      postIds?: string[];
      triggerType?: string;
    },
    flowId?: string
  ) {
    if (input.postMode !== 'scheduled') {
      if (input.scheduledPostId)
        throw new HttpException('INVALID_SCHEDULED_SELECTION', 400);
      return;
    }
    if (input.triggerType && input.triggerType !== 'comment_on_post')
      throw new HttpException('SCHEDULED_COMMENTS_ONLY', 400);
    if (
      typeof input.scheduledPostId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(input.scheduledPostId) ||
      input.postIds?.length
    )
      throw new HttpException('INVALID_SCHEDULED_SELECTION', 400);
    await this.assertSelection(
      scope,
      integrationId,
      input.scheduledPostId,
      flowId
    );
  }
  capture(event: CommentEvent) {
    return this.repository.capture(event);
  }
}
