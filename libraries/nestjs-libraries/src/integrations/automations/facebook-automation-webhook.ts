import { createHmac, timingSafeEqual } from 'node:crypto';
import { MetaAutomationError, record } from './meta-automation-graph.client';

export interface FacebookWebhookContext {
  pageId: string;
  integrationId: string;
  organizationId: string;
  profileId: string;
  appSecret: string;
}

export interface FacebookCommentEvent {
  platform: 'facebook';
  eventType: 'comment_on_post';
  pageId: string;
  integrationId: string;
  organizationId: string;
  profileId: string;
  externalEventId: string;
  externalPostId: string;
  externalActorId: string;
  text: string;
  occurredAt: number;
}

/**
 * Parses the exact signed bytes. Contexts must be resolved by Page/org/profile,
 * never by searching all tenant secrets for one matching signature.
 * Conservative root-comment contract; ambiguous photo/reply formats await live fixtures.
 */
export function verifyFacebookPageWebhook(
  rawBody: Buffer,
  signature: string,
  contexts: FacebookWebhookContext[]
) {
  if (
    !Buffer.isBuffer(rawBody) ||
    rawBody.length > 1024 * 1024 ||
    !/^sha256=[a-f0-9]{64}$/.test(signature || '')
  ) {
    throw new MetaAutomationError('INVALID_INPUT');
  }
  let body: Record<string, unknown>;
  try {
    body = record(JSON.parse(rawBody.toString('utf8')));
  } catch {
    throw new MetaAutomationError('INVALID_INPUT');
  }
  if (
    body.object !== 'page' ||
    !Array.isArray(body.entry) ||
    body.entry.length > 100
  )
    throw new MetaAutomationError('INVALID_INPUT');
  const digest = Buffer.from(signature.slice(7), 'hex');
  const signed = contexts.filter(
    (context) =>
      context.appSecret &&
      context.integrationId &&
      context.organizationId &&
      context.profileId &&
      timingSafeEqual(
        createHmac('sha256', context.appSecret).update(rawBody).digest(),
        digest
      )
  );
  if (!signed.length) throw new MetaAutomationError('PERMISSION_DENIED');
  return { entries: body.entry, signed };
}

export function parseFacebookCommentWebhook(
  rawBody: Buffer,
  signature: string,
  contexts: FacebookWebhookContext[]
) {
  const { entries, signed } = verifyFacebookPageWebhook(
    rawBody,
    signature,
    contexts
  );
  const events: FacebookCommentEvent[] = [];
  let ignoredCount = 0;
  let rejectedEntryCount = 0;
  for (const rawEntry of entries) {
    const entry = record(rawEntry);
    const owners = signed.filter((context) => context.pageId === entry.id);
    if (!owners.length) {
      rejectedEntryCount++;
      continue;
    }
    // Messenger shares the Page callback but is not a feed comment. Never mask
    // a present malformed changes field, even when messaging is also present.
    if (
      !Object.prototype.hasOwnProperty.call(entry, 'changes') &&
      Array.isArray(entry.messaging) &&
      entry.messaging.length <= 100
    ) {
      ignoredCount += entry.messaging.length;
      continue;
    }
    if (!Array.isArray(entry.changes) || entry.changes.length > 100)
      throw new MetaAutomationError('INVALID_INPUT');
    for (const rawChange of entry.changes) {
      const change = record(rawChange);
      const value = record(change.value);
      const actor = record(value.from).id;
      const post = value.post_id;
      const comment = value.comment_id;
      if (
        change.field !== 'feed' ||
        value.item !== 'comment' ||
        value.verb !== 'add' ||
        typeof actor !== 'string' ||
        !/^\d+$/.test(actor) ||
        actor === entry.id ||
        typeof post !== 'string' ||
        !/^\d+_\d+$/.test(post) ||
        !post.startsWith(`${entry.id}_`) ||
        typeof comment !== 'string' ||
        !/^\d+(?:_\d+)?$/.test(comment) ||
        value.parent_id !== post ||
        typeof value.message !== 'string' ||
        !value.message.trim() ||
        value.message.length > 10000 ||
        typeof value.created_time !== 'number' ||
        !Number.isSafeInteger(value.created_time) ||
        value.created_time <= 0 ||
        !Number.isSafeInteger(value.created_time * 1000)
      ) {
        ignoredCount++;
        continue;
      }
      for (const owner of owners)
        events.push({
          platform: 'facebook',
          eventType: 'comment_on_post',
          pageId: owner.pageId,
          integrationId: owner.integrationId,
          organizationId: owner.organizationId,
          profileId: owner.profileId,
          externalEventId: comment,
          externalPostId: post,
          externalActorId: actor,
          text: value.message,
          occurredAt: value.created_time * 1000,
        });
    }
  }
  return { events, ignoredCount, rejectedEntryCount };
}
