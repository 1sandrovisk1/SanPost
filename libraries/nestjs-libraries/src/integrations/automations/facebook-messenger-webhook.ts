import type { CommentEvent } from '../../dtos/flows/flow-v2.dto';
import {
  FacebookWebhookContext,
  verifyFacebookPageWebhook,
} from './facebook-automation-webhook';
import { record, MetaAutomationError } from './meta-automation-graph.client';

export const MESSENGER_WINDOW_MS = 24 * 60 * 60 * 1000;
export function validMessengerEvent(event: CommentEvent, now = Date.now()) {
  return (
    event.eventType === 'messenger_message' &&
    event.platform === 'facebook' &&
    [event.remoteAccountId, event.externalActorId].every(
      (id) => typeof id === 'string' && /^\d{1,100}$/.test(id)
    ) &&
    event.externalActorId !== event.remoteAccountId &&
    event.externalPostId === '' &&
    typeof event.externalEventId === 'string' &&
    /^[\x21-\x7e]{1,512}$/.test(event.externalEventId) &&
    typeof event.text === 'string' &&
    !!event.text.trim() &&
    event.text.length <= 10000 &&
    Number.isSafeInteger(event.occurredAt) &&
    event.occurredAt > 0 &&
    event.occurredAt <= now + 60000 &&
    now - event.occurredAt < MESSENGER_WINDOW_MS
  );
}

/** Only signed incoming text messages, including Story replies delivered as ordinary DMs. */
export function parseFacebookMessengerWebhook(
  raw: Buffer,
  signature: string,
  contexts: FacebookWebhookContext[]
): CommentEvent[] {
  const { entries, signed } = verifyFacebookPageWebhook(
    raw,
    signature,
    contexts
  );
  const events: CommentEvent[] = [];
  for (const rawEntry of entries) {
    const entry = record(rawEntry);
    const owners = signed.filter((owner) => owner.pageId === entry.id);
    if (!owners.length || entry.messaging === undefined) continue;
    if (!Array.isArray(entry.messaging) || entry.messaging.length > 100)
      throw new MetaAutomationError('INVALID_INPUT');
    for (const rawMessage of entry.messaging) {
      const item = record(rawMessage);
      const message = record(item.message);
      if (
        record(item.recipient).id !== entry.id ||
        [
          'is_echo',
          'is_deleted',
          'is_unsupported',
          'admin_text',
          'quick_reply',
        ].some((key) => Object.prototype.hasOwnProperty.call(message, key)) ||
        item.postback ||
        item.delivery ||
        item.read
      )
        continue;
      for (const owner of owners) {
        const event: CommentEvent = {
          organizationId: owner.organizationId,
          profileId: owner.profileId,
          integrationId: owner.integrationId,
          platform: 'facebook',
          eventType: 'messenger_message',
          remoteAccountId: owner.pageId,
          externalEventId: message.mid as string,
          externalPostId: '',
          externalActorId: record(item.sender).id as string,
          text: message.text as string,
          occurredAt: item.timestamp as number,
        };
        if (validMessengerEvent(event)) events.push(event);
      }
    }
  }
  return events;
}
