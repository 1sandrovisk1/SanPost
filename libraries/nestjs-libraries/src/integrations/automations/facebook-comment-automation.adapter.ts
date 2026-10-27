import {
  MetaAutomationError,
  MetaAutomationGraphClient,
  record,
} from './meta-automation-graph.client';

export interface FacebookAutomationConnection {
  pageId: string;
  appId: string;
  pageAccessToken: string;
  appAccessToken: string;
}

export interface FacebookPrivateReply {
  commentId: string;
  occurredAt: number;
  text: string;
  button?: { title: string; url: string };
}

// Requested separately from publishing scopes: granting posting access does not grant messaging.
export const FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS = [
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_read_user_content',
] as const;
export const FACEBOOK_PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function assertMetaId(value: string, composite = false): void {
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    !(composite ? /^\d+(?:_\d+)?$/ : /^\d+$/).test(value)
  ) {
    throw new MetaAutomationError('INVALID_INPUT');
  }
}

export function validateFacebookPrivateReply(
  reply: FacebookPrivateReply,
  now: number
): void {
  assertMetaId(reply.commentId, true);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(reply.occurredAt) ||
    reply.occurredAt > now ||
    now - reply.occurredAt >= FACEBOOK_PRIVATE_REPLY_WINDOW_MS
  )
    throw new MetaAutomationError('INVALID_INPUT');
  validateFacebookMessage(reply);
}

export function validateFacebookMessage(
  reply: Pick<FacebookPrivateReply, 'text' | 'button'>
): void {
  if (
    typeof reply.text !== 'string' ||
    !reply.text.trim() ||
    reply.text.length > (reply.button ? 640 : 2000)
  )
    throw new MetaAutomationError('INVALID_INPUT');
  if (reply.button) {
    if (
      typeof reply.button.title !== 'string' ||
      !reply.button.title.trim() ||
      reply.button.title.length > 20 ||
      typeof reply.button.url !== 'string' ||
      reply.button.url.length > 2000
    )
      throw new MetaAutomationError('INVALID_INPUT');
    let url: URL;
    try {
      url = new URL(reply.button.url);
    } catch {
      throw new MetaAutomationError('INVALID_INPUT');
    }
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new MetaAutomationError('INVALID_INPUT');
  }
}

/** Internal adapter for the Meta proof. Not registered as a publishing provider or active automation engine. */
export class FacebookCommentAutomationAdapter {
  constructor(private readonly client = new MetaAutomationGraphClient()) {}

  async inspect(
    connection: FacebookAutomationConnection,
    now: number,
    publicReply = false
  ) {
    assertMetaId(connection.pageId);
    assertMetaId(connection.appId);
    const reasons: string[] = [];
    const required: string[] = [...FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS];
    if (publicReply) required.push('pages_manage_engagement');
    const debug = record(
      (
        await this.client.read('debug_token', connection.appAccessToken, {
          input_token: connection.pageAccessToken,
        })
      ).data
    );
    if (debug.is_valid !== true) reasons.push('TOKEN_INVALID');
    if (debug.app_id !== connection.appId) reasons.push('APP_MISMATCH');
    if (debug.type !== 'PAGE') reasons.push('PAGE_TOKEN_REQUIRED');
    if (
      debug.profile_id !== undefined &&
      debug.profile_id !== connection.pageId
    )
      reasons.push('PAGE_MISMATCH');
    for (const [field, reason] of [
      ['expires_at', 'TOKEN_EXPIRED'],
      ['data_access_expires_at', 'DATA_ACCESS_EXPIRED'],
    ]) {
      const value = debug[field];
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        (value !== 0 && value * 1000 <= now)
      )
        reasons.push(reason);
    }
    const scopes = Array.isArray(debug.scopes) ? debug.scopes : [];
    const missingPermissions = required.filter(
      (scope) => !scopes.includes(scope)
    );
    if (missingPermissions.length) reasons.push('PERMISSIONS_MISSING');
    for (const item of Array.isArray(debug.granular_scopes)
      ? debug.granular_scopes
      : []) {
      const grant = record(item);
      if (
        required.includes(grant.scope as string) &&
        Array.isArray(grant.target_ids) &&
        !grant.target_ids.includes(connection.pageId)
      )
        reasons.push('PAGE_PERMISSION_MISSING');
    }
    if (reasons.length)
      return {
        status: 'BLOCKED' as const,
        reasons: [...new Set(reasons)],
        missingPermissions,
        liveProofRequired: true,
        posts: [],
      };
    const identity = await this.client.read('me', connection.pageAccessToken, {
      fields: 'id',
    });
    if (identity.id !== connection.pageId) {
      return {
        status: 'BLOCKED' as const,
        reasons: ['PAGE_MISMATCH'],
        missingPermissions,
        liveProofRequired: true,
        posts: [],
      };
    }
    const subscriptions = await this.client.read(
      `${connection.pageId}/subscribed_apps`,
      connection.pageAccessToken,
      { fields: 'id,subscribed_fields', limit: '100' }
    );
    const own = (Array.isArray(subscriptions.data) ? subscriptions.data : [])
      .map(record)
      .find((app) => app.id === connection.appId);
    if (
      !own ||
      !Array.isArray(own.subscribed_fields) ||
      !own.subscribed_fields.includes('feed')
    ) {
      reasons.push(
        record(subscriptions.paging).next
          ? 'SUBSCRIPTIONS_INCOMPLETE'
          : 'FEED_SUBSCRIPTION_MISSING'
      );
    }
    const posts = await this.client.read(
      `${connection.pageId}/published_posts`,
      connection.pageAccessToken,
      {
        fields: 'id,created_time',
        limit: '10',
      }
    );
    if (!Array.isArray(posts.data)) reasons.push('POSTS_RESPONSE_INVALID');
    return {
      status: reasons.length
        ? ('BLOCKED' as const)
        : ('PREFLIGHT_PASSED' as const),
      reasons,
      missingPermissions,
      liveProofRequired: true,
      posts: (Array.isArray(posts.data) ? posts.data : [])
        .map(record)
        .filter(
          (post) =>
            typeof post.id === 'string' &&
            post.id.startsWith(`${connection.pageId}_`)
        )
        .map((post) => ({
          id: post.id as string,
          createdTime:
            typeof post.created_time === 'string'
              ? post.created_time
              : undefined,
        })),
    };
  }

  async sendPrivateReply(
    connection: FacebookAutomationConnection,
    reply: FacebookPrivateReply,
    now: number
  ) {
    assertMetaId(connection.pageId);
    validateFacebookPrivateReply(reply, now);
    const message = reply.button
      ? {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'button',
              text: reply.text,
              buttons: [
                {
                  type: 'web_url',
                  title: reply.button.title,
                  url: reply.button.url,
                },
              ],
            },
          },
        }
      : { text: reply.text };
    return this.client.write(
      `${connection.pageId}/messages`,
      connection.pageAccessToken,
      {
        recipient: { comment_id: reply.commentId },
        message,
      },
      'message_id'
    );
  }

  async replyPublicly(
    connection: FacebookAutomationConnection,
    reply: { commentId: string; text: string }
  ) {
    assertMetaId(connection.pageId);
    assertMetaId(reply.commentId, true);
    if (
      typeof reply.text !== 'string' ||
      !reply.text.trim() ||
      reply.text.length > 2000
    )
      throw new MetaAutomationError('INVALID_INPUT');
    return this.client.write(
      `${reply.commentId}/comments`,
      connection.pageAccessToken,
      { message: reply.text },
      'id'
    );
  }
}
