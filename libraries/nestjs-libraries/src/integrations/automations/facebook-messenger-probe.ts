import { createHash } from 'node:crypto';
import { record } from './meta-automation-graph.client';
import { verifyFacebookPageWebhook } from './facebook-automation-webhook';
import type { FacebookSetupConnection } from './facebook-automation-setup.repository';

const SCOPE_KEYS = [
  'organizationId',
  'profileId',
  'integrationId',
  'pageId',
  'appId',
] as const;
export type MessengerProbe = Pick<
  FacebookSetupConnection,
  (typeof SCOPE_KEYS)[number]
> & {
  issuedAt: number;
  expiresAt: number;
  nonce: string;
  mode?: 'full-json';
  testTexts?: string[];
};
export interface MessengerObservation {
  receivedAt: string;
  occurredAt: number | null;
  messageHash: string | null;
  hasText: boolean;
  isEcho: boolean;
  isUnsupported: boolean;
  attachmentTypes: string[];
  fields: Record<string, string>;
  unknownFieldCount: number;
  truncated: boolean;
}

/** The Redis key's TTL is not sufficient: enforce the absolute window and scope. */
export function validMessengerProbe(
  value: unknown,
  connection: FacebookSetupConnection,
  now = Date.now()
): value is MessengerProbe {
  const arm = record(value);
  return (
    SCOPE_KEYS.every(
      (key) =>
        typeof arm[key] === 'string' &&
        !!arm[key] &&
        arm[key] === connection[key]
    ) &&
    typeof arm.nonce === 'string' &&
    /^[a-f0-9]{32}$/.test(arm.nonce) &&
    typeof arm.issuedAt === 'number' &&
    Number.isSafeInteger(arm.issuedAt) &&
    arm.issuedAt > 0 &&
    arm.issuedAt <= now &&
    typeof arm.expiresAt === 'number' &&
    Number.isSafeInteger(arm.expiresAt) &&
    arm.expiresAt > now &&
    arm.expiresAt - arm.issuedAt <= 86400000 &&
    (arm.mode === undefined ||
      (arm.mode === 'full-json' &&
        arm.expiresAt - arm.issuedAt <= 7200000 &&
        Array.isArray(arm.testTexts) &&
        arm.testTexts.length === 2 &&
        new Set(arm.testTexts).size === 2 &&
        arm.testTexts.every(
          (text) =>
            typeof text === 'string' &&
            /^Teste (Story|DM) MultiPost [a-f0-9]{6}$/.test(text)
        )))
  );
}

// Only schema labels are retained. Unknown property names may themselves carry
// personal data, so count them without storing their names or values.
const FIELD_NAMES = new Set([
  'message',
  'mid',
  'text',
  'reply_to',
  'story',
  'story_id',
  'id',
  'url',
  'attachments',
  'type',
  'payload',
  'referral',
  'source',
  'ref',
  'is_echo',
  'is_unsupported',
  'is_deleted',
  'admin_text',
  'quick_reply',
  'sticker_id',
  'ad_id',
  'ads_context_data',
  'post_id',
  'media_id',
  'title',
  'mention',
  'share',
  'story_mention',
  'story_reply',
  'is_self_reply',
  'original_media_id',
]);
const ATTACHMENT_TYPES = new Set([
  'audio',
  'file',
  'image',
  'sticker',
  'video',
  'fallback',
  'reel',
  'ig_reel',
  'post',
  'ig_post',
  'appointment_booking',
  'story',
  'story_mention',
]);

function summarize(
  event: Record<string, unknown>,
  now: number
): MessengerObservation {
  const message = record(event.message);
  const timestamp = event.timestamp;
  const fields: Record<string, string> = {};
  let unknownFieldCount = 0;
  let truncated = false;
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > 5 || Object.keys(fields).length >= 80) {
      truncated = true;
      return;
    }
    if (path)
      fields[path] =
        value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (Array.isArray(value)) {
      if (value.length > 3) truncated = true;
      value
        .slice(0, 3)
        .forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        if (!FIELD_NAMES.has(key)) {
          unknownFieldCount++;
          continue;
        }
        walk(item, path ? `${path}.${key}` : key, depth + 1);
      }
    }
  };
  walk(event, '', 0);
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.slice(0, 3)
    : [];
  return {
    receivedAt: new Date(now).toISOString(),
    occurredAt:
      typeof timestamp === 'number' &&
      Number.isSafeInteger(timestamp) &&
      timestamp > 0 &&
      timestamp <= now + 60000
        ? timestamp
        : null,
    messageHash:
      typeof message.mid === 'string' && message.mid.length <= 1024
        ? createHash('sha256').update(message.mid).digest('hex')
        : null,
    hasText: typeof message.text === 'string' && message.text.length > 0,
    isEcho: message.is_echo === true,
    isUnsupported: message.is_unsupported === true,
    attachmentTypes: [
      ...new Set(
        attachments.map((attachment) => {
          const type = record(attachment).type;
          return typeof type === 'string' && ATTACHMENT_TYPES.has(type)
            ? type
            : 'other';
        })
      ),
    ],
    fields,
    unknownFieldCount,
    truncated,
  };
}

/** Observation only: no normalized automation event, raw data, or send capability. */
export function inspectFacebookMessengerWebhook(
  raw: Buffer,
  signature: string,
  contexts: FacebookSetupConnection[],
  now = Date.now()
) {
  const { entries, signed } = verifyFacebookPageWebhook(
    raw,
    signature,
    contexts
  );
  const observations: Array<{
    organizationId: string;
    profileId: string;
    integrationId: string;
    observation: MessengerObservation;
  }> = [];
  for (const rawEntry of entries) {
    const entry = record(rawEntry);
    const owners = signed.filter((context) => context.pageId === entry.id);
    if (
      !owners.length ||
      !Array.isArray(entry.messaging) ||
      entry.messaging.length > 100
    )
      continue;
    for (const rawMessage of entry.messaging) {
      const event = record(rawMessage);
      const message = record(event.message);
      const isEcho = message.is_echo === true;
      if (
        !Object.keys(message).length ||
        (isEcho
          ? record(event.sender).id !== entry.id
          : record(event.recipient).id !== entry.id)
      )
        continue;
      for (const owner of owners) {
        if (observations.length >= 20) return observations;
        observations.push({
          organizationId: owner.organizationId,
          profileId: owner.profileId,
          integrationId: owner.integrationId,
          observation: summarize(event, now),
        });
      }
    }
  }
  return observations;
}
