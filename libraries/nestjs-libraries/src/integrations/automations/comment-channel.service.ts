import { validMessengerEvent } from './facebook-messenger-webhook';
import { CredentialService } from '../../database/prisma/credentials/credential.service';
import { HttpException, Injectable } from '@nestjs/common';
import { SharedFlowsRepository } from '../../database/prisma/flows-v2/shared-flows.repository';
import { FacebookAutomationSetupService } from './facebook-automation-setup.service';
import {
  MetaAutomationGraphClient,
  MetaAutomationError,
  record,
} from './meta-automation-graph.client';
import { InstagramMessagingService } from '../social/instagram-messaging.service';
import { resolveIgRoute } from '../social/instagram-route.resolver';
import { metaGraphUrl } from '../social/meta-graph.constants';
import { EncryptionService } from '../../crypto/encryption.service';
import { decryptIntegrationToken } from '../../crypto/integration-token.helper';
import type {
  AutomationReadiness,
  CommentEvent,
  FlowScope,
  ResolveAutomationPostView,
} from '../../dtos/flows/flow-v2.dto';
import type {
  AutomationTriggerType,
  CommentAction,
} from '../../database/prisma/flows-v2/flow-definition';
import {
  validateFacebookPrivateReply,
  validateFacebookMessage,
} from './facebook-comment-automation.adapter';
import {
  facebookPostReference,
  facebookPostPreview,
  facebookPostVideoId,
} from './facebook-post-reference';
@Injectable()
export class CommentChannelService {
  constructor(
    private readonly repository: SharedFlowsRepository,
    private readonly facebook: FacebookAutomationSetupService,
    private readonly messaging: InstagramMessagingService,
    private readonly encryption: EncryptionService,
    private readonly credentials: CredentialService
  ) {}
  private async connection(scope: FlowScope, id: string) {
    const integration = await this.repository.integration(scope, id);
    if (integration.providerIdentifier === 'facebook') {
      const connection = await this.facebook.authorizedAccount(scope, id);
      return {
        integration,
        token: connection.pageToken,
        graph: new MetaAutomationGraphClient(),
        facebook: true,
        messageAccount: connection.pageId,
        useIgGraph: false,
        routeSource: 'facebook' as const,
      };
    }
    const route = await resolveIgRoute(
      {
        ...integration,
        token: decryptIntegrationToken(this.encryption, integration.token),
      },
      this.messaging
    );
    const graph = new MetaAutomationGraphClient(
      undefined,
      metaGraphUrl(route.host)
    );
    const identity = await graph.read('me', route.token, { fields: 'id' });
    if (typeof identity.id !== 'string' || !/^\d+$/.test(identity.id))
      throw new HttpException('CHANNEL_IDENTITY_INVALID', 412);
    // IG Login addresses /me; Facebook Login resolves the Page from the token.
    return {
      integration,
      token: route.token,
      graph,
      facebook: false,
      messageAccount: route.useIgGraph ? 'me' : identity.id,
      useIgGraph: route.useIgGraph,
      routeSource: route.source,
    };
  }
  async activateMessenger(
    scope: FlowScope,
    id: string
  ): Promise<AutomationReadiness> {
    const integration = await this.repository.integration(scope, id);
    if (integration.providerIdentifier !== 'facebook')
      throw new HttpException('MESSENGER_FACEBOOK_ONLY', 400);
    await this.facebook.inspectMessengerAccount(scope, id, true);
    return this.readiness(scope, id, 'messenger_message');
  }
  async readiness(
    scope: FlowScope,
    id: string,
    triggerType: AutomationTriggerType = 'comment_on_post'
  ): Promise<AutomationReadiness> {
    const checkedAt = new Date().toISOString();
    try {
      const integration = await this.repository.integration(scope, id);
      if (integration.providerIdentifier === 'facebook') {
        const status =
          triggerType === 'messenger_message'
            ? await this.facebook.inspectMessengerAccount(scope, id)
            : await this.facebook.inspectAccount(scope, id);
        return {
          ready: status.stage === 'RECEIVING_READY',
          reason:
            status.stage === 'RECEIVING_READY'
              ? undefined
              : status.reasons[0] || status.stage,
          checkedAt,
          tokenExpiresAt: status.tokenExpiresAt,
          dataAccessExpiresAt: status.dataAccessExpiresAt,
          noScheduledExpiry: status.noScheduledExpiry,
        };
      }
      if (triggerType === 'messenger_message')
        throw new HttpException('MESSENGER_FACEBOOK_ONLY', 400);
      const connection = await this.connection(scope, id);
      const creds = await this.credentials.getRawShared(
        scope.organizationId,
        'facebook',
        scope.profileId
      );
      const appId = connection.useIgGraph
        ? creds?.instagramAppId || process.env.INSTAGRAM_APP_ID
        : creds?.clientId || process.env.FACEBOOK_APP_ID;
      const secret = connection.useIgGraph
        ? creds?.instagramAppSecret || process.env.INSTAGRAM_APP_SECRET
        : creds?.clientSecret || process.env.FACEBOOK_APP_SECRET;
      if (!appId || !secret)
        return { ready: false, reason: 'APP_CREDENTIALS_REQUIRED', checkedAt };
      const subscriptions = await connection.graph.read(
        `${integration.internalId}/subscribed_apps`,
        connection.token,
        { fields: 'id,subscribed_fields' }
      );
      const appSubscriptions = await connection.graph.read(
        `${appId}/subscriptions`,
        `${appId}|${secret}`
      );
      const base = (
        process.env.WEBHOOK_BASE_URL || `${process.env.FRONTEND_URL || ''}/api`
      ).replace(/\/+$/, '');
      const expected = `${base}/public/ig-webhook`;
      const configured =
        Array.isArray(appSubscriptions.data) &&
        appSubscriptions.data.some((raw) => {
          const sub = record(raw);
          return (
            sub.object === 'instagram' &&
            sub.active === true &&
            String(sub.callback_url).replace(/\/+$/, '') === expected &&
            Array.isArray(sub.fields) &&
            sub.fields.some((f) => record(f).name === 'comments')
          );
        });
      const ready =
        configured &&
        Array.isArray(subscriptions.data) &&
        subscriptions.data.some(
          (raw) =>
            record(raw).id === appId &&
            Array.isArray(record(raw).subscribed_fields) &&
            (record(raw).subscribed_fields as string[]).includes('comments')
        );
      return {
        ready,
        reason: ready ? undefined : 'IG_COMMENTS_SUBSCRIPTION_REQUIRED',
        checkedAt,
      };
    } catch {
      return {
        ready: false,
        reason: 'AUTHORIZATION_CHECK_REQUIRED',
        checkedAt,
      };
    }
  }
  async posts(scope: FlowScope, id: string, cursor?: string) {
    if (cursor && (cursor.length > 2048 || !/^[A-Za-z0-9_=-]+$/.test(cursor)))
      throw new HttpException('INVALID_CURSOR', 400);
    const c = await this.connection(scope, id);
    const data = await c.graph.read(
      `${c.integration.internalId}/${c.facebook ? 'published_posts' : 'media'}`,
      c.token,
      {
        fields: c.facebook
          ? 'id,message,permalink_url,created_time,full_picture'
          : 'id,caption,permalink,timestamp,thumbnail_url,media_url',
        limit: '25',
        ...(cursor ? { after: cursor } : {}),
      }
    );
    return {
      posts: (Array.isArray(data.data) ? data.data : [])
        .map(record)
        .filter((p) => typeof p.id === 'string')
        .map((p) => ({
          id: p.id,
          caption: p.message || p.caption || '',
          permalink: p.permalink_url || p.permalink,
          thumbnailUrl: p.full_picture || p.thumbnail_url || p.media_url,
          timestamp: p.created_time || p.timestamp,
        })),
      nextCursor: record(data.paging).next
        ? record(record(data.paging).cursors).after
        : null,
    };
  }
  async resolvePost(
    scope: FlowScope,
    id: string,
    reference: string
  ): Promise<ResolveAutomationPostView> {
    const integration = await this.repository.integration(scope, id);
    if (integration.providerIdentifier !== 'facebook')
      throw new HttpException('POST_LOOKUP_FACEBOOK_ONLY', 400);
    const postId = facebookPostReference(reference, integration.internalId);
    const connection = await this.facebook.authorizedPostLookup(scope, id);
    if (connection.pageId !== integration.internalId)
      throw new HttpException('POST_CHANNEL_MISMATCH', 412);
    const post = await this.canonicalFacebookPost(
      new MetaAutomationGraphClient(),
      connection.pageToken,
      integration.internalId,
      postId
    );
    return { post: facebookPostPreview(post, String(post.id)) };
  }

  /** Shared ownership proof. Lookup budgets belong to the public entry, not activation. */
  private async canonicalFacebookPost(
    graph: MetaAutomationGraphClient,
    token: string,
    pageId: string,
    requestedId: string
  ): Promise<Record<string, unknown>> {
    const fields =
      'id,from{id},message,permalink_url,created_time,full_picture,attachments{type,media_type,target{id}}';
    const assertOwner = (
      object: Record<string, unknown>,
      expectedId: string
    ) => {
      if (object.id !== expectedId || record(object.from).id !== pageId)
        throw new HttpException('POST_CHANNEL_MISMATCH', 412);
    };
    try {
      let post: Record<string, unknown> | undefined;
      let videoId: string | undefined;
      try {
        post = await graph.read(requestedId, token, { fields });
      } catch (error) {
        // Some Videos accept Page_video as an alias; others only accept the bare Video id.
        if (
          !(error instanceof MetaAutomationError) ||
          error.category !== 'META_REJECTED'
        )
          throw error;
        videoId = requestedId.split('_')[1];
      }
      if (post) {
        assertOwner(post, requestedId);
        videoId = facebookPostVideoId(post);
        if (!videoId) return post;
      }
      if (!videoId || !/^[1-9]\d{0,31}$/.test(videoId))
        throw new HttpException('POST_VIDEO_RELATION_REQUIRED', 412);
      const video = await graph.read(videoId, token, {
        fields: 'id,from{id},post_id',
      });
      assertOwner(video, videoId);
      if (
        typeof video.post_id !== 'string' ||
        !/^[1-9]\d{0,31}(?:_[1-9]\d{0,31})?$/.test(video.post_id)
      )
        throw new HttpException('POST_VIDEO_RELATION_REQUIRED', 412);
      const canonicalId = facebookPostReference(video.post_id, pageId);
      if (post && canonicalId === requestedId) return post;
      const canonical = await graph.read(canonicalId, token, { fields });
      assertOwner(canonical, canonicalId);
      if (facebookPostVideoId(canonical) !== videoId)
        throw new HttpException('POST_VIDEO_RELATION_REQUIRED', 412);
      return canonical;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const category =
        error instanceof MetaAutomationError
          ? error.category
          : 'OUTCOME_UNKNOWN';
      if (category === 'PERMISSION_DENIED' || category === 'TOKEN_INVALID')
        throw new HttpException('POST_LOOKUP_ACCESS_REQUIRED', 412);
      if (category === 'OUTCOME_UNKNOWN' || category === 'RATE_LIMITED')
        throw new HttpException('POST_LOOKUP_RETRY', 503);
      throw new HttpException('POST_LOOKUP_UNAVAILABLE', 412);
    }
  }
  async scheduledPublishedIds(
    scope: FlowScope,
    id: string,
    releaseId: string
  ): Promise<string[]> {
    const integration = await this.repository.integration(scope, id);
    if (integration.providerIdentifier !== 'facebook') {
      if (!/^\d+$/.test(releaseId))
        throw new HttpException('PUBLICATION_ID_PENDING', 412);
      return [releaseId];
    }
    if (new RegExp(`^${integration.internalId}_\\d+$`).test(releaseId))
      return [releaseId];
    if (!/^\d+$/.test(releaseId))
      throw new HttpException('PUBLICATION_ID_PENDING', 412);
    // A video id is not a Page post id. Prove the relationship via attachments.
    const c = await this.connection(scope, id);
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await c.graph.read(
        `${integration.internalId}/published_posts`,
        c.token,
        {
          fields: 'id,attachments{target{id},subattachments{target{id}}}',
          limit: '25',
          ...(cursor ? { after: cursor } : {}),
        }
      );
      for (const raw of Array.isArray(result.data) ? result.data : []) {
        const post = record(raw);
        if (
          typeof post.id !== 'string' ||
          !new RegExp(`^${integration.internalId}_\\d+$`).test(post.id)
        )
          continue;
        const attachments = record(post.attachments).data;
        const targets = (Array.isArray(attachments) ? attachments : []).flatMap(
          (a) => {
            const attachment = record(a);
            const sub = record(attachment.subattachments).data;
            return [
              record(attachment.target).id,
              ...(Array.isArray(sub)
                ? sub.map((x) => record(record(x).target).id)
                : []),
            ];
          }
        );
        if (targets.includes(releaseId)) return [post.id];
      }
      const next = record(record(result.paging).cursors).after;
      if (
        !record(result.paging).next ||
        typeof next !== 'string' ||
        !/^[A-Za-z0-9_=-]{1,2048}$/.test(next)
      )
        break;
      cursor = next;
    }
    throw new HttpException('PUBLICATION_ID_PENDING', 412);
  }
  async assertPost(scope: FlowScope, id: string, postId: string) {
    const c = await this.connection(scope, id);
    if (c.facebook) {
      if (facebookPostReference(postId, c.integration.internalId) !== postId)
        throw new HttpException('POST_REFERENCE_NOT_CANONICAL', 412);
      const post = await this.canonicalFacebookPost(
        c.graph,
        c.token,
        c.integration.internalId,
        postId
      );
      if (post.id !== postId)
        throw new HttpException('POST_REFERENCE_NOT_CANONICAL', 412);
      return;
    }
    const post = await c.graph.read(postId, c.token, {
      fields: c.facebook ? 'id,from{id}' : 'id,owner{id}',
    });
    if (
      post.id !== postId ||
      (c.facebook ? record(post.from).id : record(post.owner).id) !==
        c.integration.internalId
    )
      throw new HttpException('POST_CHANNEL_MISMATCH', 412);
  }
  /** Returns a closure containing credentials inside this activity only, never in Temporal history. */
  async prepare(
    scope: FlowScope,
    id: string,
    event: CommentEvent,
    action: CommentAction
  ) {
    const testId = process.env.SHARED_AUTOMATION_TEST_INTEGRATION;
    if (testId && id !== testId)
      throw new HttpException('LOCAL_TEST_CHANNEL_ONLY', 412);
    const c = await this.connection(scope, id);
    if (
      event.remoteAccountId !== c.integration.internalId ||
      event.integrationId !== id ||
      event.platform !== (c.facebook ? 'facebook' : 'instagram')
    )
      throw new HttpException('CHANNEL_MISMATCH', 412);
    const messenger = event.eventType === 'messenger_message';
    const assertMessengerWindow = () => {
      if (!validMessengerEvent(event) || event.occurredAt > Date.now())
        throw new HttpException('MESSENGER_WINDOW_EXPIRED', 412);
    };
    if (messenger) {
      if (!c.facebook || action.kind !== 'messenger_reply')
        throw new HttpException('CHANNEL_MISMATCH', 412);
      assertMessengerWindow();
      const status = await this.facebook.inspectMessengerAccount(scope, id);
      if (status.stage !== 'RECEIVING_READY')
        throw new HttpException('AUTHORIZATION_CHECK_REQUIRED', 412);
      // Reuse outbound text/button validation only; Messenger never looks up a comment.
      validateFacebookMessage(action);
    } else if (action.kind === 'messenger_reply')
      throw new HttpException('CHANNEL_MISMATCH', 412);
    if (
      !messenger &&
      (Date.now() - event.occurredAt >= 7 * 86400000 ||
        event.occurredAt > Date.now())
    )
      throw new HttpException('COMMENT_EXPIRED', 412);
    if (c.facebook && !messenger) {
      const status = await this.facebook.inspectAccount(scope, id);
      if (status.stage !== 'RECEIVING_READY')
        throw new HttpException('AUTHORIZATION_CHECK_REQUIRED', 412);
      const comment = await c.graph.read(event.externalEventId, c.token, {
        fields: 'id,created_time,can_reply_privately',
      });
      const occurredAt = Date.parse(String(comment.created_time));
      if (
        comment.id !== event.externalEventId ||
        !Number.isFinite(occurredAt) ||
        Date.now() - occurredAt >= 7 * 86400000
      )
        throw new HttpException('COMMENT_EXPIRED', 412);
      if (
        action.kind === 'private_reply' &&
        comment.can_reply_privately !== true
      )
        throw new HttpException('PRIVATE_REPLY_UNAVAILABLE', 412);
    }
    if (action.kind === 'private_reply')
      validateFacebookPrivateReply(
        {
          commentId: event.externalEventId,
          occurredAt: event.occurredAt,
          text: action.text,
          button: action.button,
        },
        Date.now()
      );
    const message = action.button
      ? {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: action.text,
              buttons: [
                {
                  type: 'web_url',
                  title: action.button.title,
                  url: action.button.url,
                },
              ],
            },
          },
        }
      : { text: action.text };
    return async () => {
      // Only local credential reads after the preflight; route resolution may
      // refresh tokens over HTTP, so it must not run again at the send boundary.
      let effectiveToken = c.token;
      if (c.facebook) {
        const current = await this.facebook.authorizedAccount(scope, id);
        if (current.pageId !== c.messageAccount)
          throw new HttpException('AUTHORIZATION_CHANGED', 409);
        effectiveToken = current.pageToken;
      } else if (c.integration.providerIdentifier === 'instagram') {
        const state = await this.messaging.loadState(
          scope.organizationId,
          scope.profileId
        );
        const override = state.instagramTokens.find(
          (item) => item.igUserId === c.integration.internalId
        );
        if (c.routeSource === 'ig-user-token')
          effectiveToken = override?.token || '';
        else if (override)
          throw new HttpException('AUTHORIZATION_CHANGED', 409);
      }
      const latest = await this.repository.integration(scope, id);
      if (
        effectiveToken !== c.token ||
        latest.internalId !== c.integration.internalId ||
        latest.providerIdentifier !== c.integration.providerIdentifier ||
        latest.token !== c.integration.token
      )
        throw new HttpException('AUTHORIZATION_CHANGED', 409);
      if (messenger) {
        assertMessengerWindow();
        return c.graph.write(
          `${c.messageAccount}/messages`,
          c.token,
          {
            recipient: { id: event.externalActorId },
            messaging_type: 'RESPONSE',
            message,
          },
          'message_id'
        );
      }
      return action.kind === 'private_reply'
        ? c.graph.write(
            `${c.messageAccount}/messages`,
            c.token,
            { recipient: { comment_id: event.externalEventId }, message },
            'message_id'
          )
        : c.graph.write(
            `${event.externalEventId}/${c.facebook ? 'comments' : 'replies'}`,
            c.token,
            { message: action.text },
            'id'
          );
    };
  }
}
