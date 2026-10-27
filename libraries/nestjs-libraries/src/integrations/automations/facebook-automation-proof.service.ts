import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  FacebookAutomationProofRepository,
  safeProofResult,
} from './facebook-automation-proof.repository';
import { FacebookAutomationSetupService } from './facebook-automation-setup.service';
import {
  FacebookAutomationSetupRepository,
  FacebookSetupContext,
} from './facebook-automation-setup.repository';
import {
  MetaAutomationDelivery,
  MetaAutomationGraphClient,
} from './meta-automation-graph.client';
import {
  FacebookCommentAutomationAdapter,
  validateFacebookPrivateReply,
} from './facebook-comment-automation.adapter';
import type {
  FacebookPrivateReplyTestView,
  SendFacebookPrivateReplyTestDto,
} from '../../dtos/integrations/facebook-automation.dto';

@Injectable()
export class FacebookAutomationProofService {
  constructor(
    private readonly repository: FacebookAutomationProofRepository,
    private readonly setup: FacebookAutomationSetupService,
    private readonly receipts: FacebookAutomationSetupRepository,
    private readonly graph: MetaAutomationGraphClient
  ) {}

  private async prepare(context: FacebookSetupContext, id: string) {
    const config = await this.repository.config();
    if (
      !config ||
      !context.userId ||
      config.organizationId !== context.organizationId ||
      config.profileId !== context.profileId ||
      config.integrationId !== id
    )
      return null;
    const connection = await this.setup.authorizedConnection(context, id);
    if (
      connection.pageId !== config.pageId ||
      connection.appId !== config.appId
    )
      throw new HttpException('PROOF_AUTHORIZATION_CHANGED', 409);
    const result = await this.repository.read(config);
    // The receipt may expire or be replaced, but a previous reservation must remain visible.
    const receipt = result ? null : await this.receipts.getReceipt(context, id);
    const matches =
      receipt?.commentId === config.commentId &&
      receipt?.postId === config.postId;
    const revision = createHash('sha256')
      .update(JSON.stringify([config, connection, receipt]))
      .digest('hex');
    const view: FacebookPrivateReplyTestView = {
      available: true,
      pageId: config.pageId,
      postId: config.postId,
      commentId: config.commentId,
      text: config.text,
      revision,
      canSend: !result && matches,
      blockedReason: !result && !matches ? 'RECEIPT_REQUIRED' : null,
      result,
    };
    return { config, connection, view };
  }
  async view(
    context: FacebookSetupContext,
    id: string
  ): Promise<FacebookPrivateReplyTestView> {
    return (await this.prepare(context, id))?.view || { available: false };
  }
  async send(
    context: FacebookSetupContext,
    id: string,
    input: SendFacebookPrivateReplyTestDto
  ): Promise<FacebookPrivateReplyTestView> {
    const initial = await this.prepare(context, id);
    if (!initial) throw new HttpException('PROOF_UNAVAILABLE', 404);
    if (initial.view.result) return initial.view;
    if (
      !/^[a-f0-9]{64}$/.test(input.revision) ||
      input.revision !== initial.view.revision
    )
      throw new HttpException('PROOF_PREVIEW_CHANGED', 409);
    if (!initial.view.canSend)
      throw new HttpException('PROOF_RECEIPT_REQUIRED', 412);
    const { config, connection } = initial;
    let reply: { commentId: string; text: string; occurredAt: number };
    try {
      const readiness = await this.setup.inspectReceiving(context, id);
      if (readiness.stage !== 'RECEIVING_READY') throw Error();
      const comment = await this.graph.read(
        config.commentId,
        connection.pageToken,
        { fields: 'id,created_time,can_reply_privately' }
      );
      if (
        comment.id !== config.commentId ||
        comment.can_reply_privately !== true ||
        typeof comment.created_time !== 'string'
      )
        throw Error();
      reply = {
        commentId: config.commentId,
        text: config.text,
        occurredAt: Date.parse(comment.created_time),
      };
      validateFacebookPrivateReply(reply, Date.now());
    } catch {
      throw new HttpException('PROOF_PREFLIGHT_BLOCKED', 412);
    }
    const current = await this.prepare(context, id);
    if (!current) throw new HttpException('PROOF_UNAVAILABLE', 404);
    if (current.view.result) return current.view;
    if (
      !current.view.canSend ||
      current.view.revision !== initial.view.revision
    )
      throw new HttpException('PROOF_PREVIEW_CHANGED', 409);
    try {
      await this.repository.reserve(config);
    } catch {
      throw new HttpException('PROOF_RESERVED_OR_STORAGE_UNAVAILABLE', 409);
    }
    let delivery: MetaAutomationDelivery;
    try {
      delivery = await new FacebookCommentAutomationAdapter(
        this.graph
      ).sendPrivateReply(
        {
          pageId: connection.pageId,
          appId: connection.appId,
          pageAccessToken: connection.pageToken,
          appAccessToken: `${connection.appId}|${connection.appSecret}`,
        },
        reply,
        Date.now()
      );
    } catch {
      delivery = { status: 'UNKNOWN', error: { category: 'OUTCOME_UNKNOWN' } };
    }
    try {
      await this.repository.complete(config, delivery);
    } catch {
      delivery = { status: 'UNKNOWN', error: { category: 'OUTCOME_UNKNOWN' } };
    }
    return {
      ...current.view,
      canSend: false,
      result: {
        ...safeProofResult(delivery),
        updatedAt: new Date().toISOString(),
      },
    };
  }
}
