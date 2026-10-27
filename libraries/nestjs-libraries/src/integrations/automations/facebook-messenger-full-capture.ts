import { createHash } from 'node:crypto';
import { record } from './meta-automation-graph.client';
import { verifyFacebookPageWebhook } from './facebook-automation-webhook';
import { validMessengerProbe } from './facebook-messenger-probe';
import type { FacebookSetupConnection } from './facebook-automation-setup.repository';

export interface MessengerFullCapture {
  receivedAt: string;
  bodyHash: string;
  testIndexes: number[];
  status: 'captured' | 'skipped';
  reason?: 'MIXED_BATCH' | 'TOO_LARGE' | 'INVALID_UTF8';
  rawJson?: string;
}

/** No field filtering: either retain the whole test request or reject the capture. */
export function captureFacebookMessengerJson(
  raw: Buffer,
  signature: string,
  connection: FacebookSetupConnection,
  probe: unknown,
  now = Date.now()
): MessengerFullCapture | null {
  if (
    !validMessengerProbe(probe, connection, now) ||
    probe.mode !== 'full-json'
  )
    return null;
  const { entries } = verifyFacebookPageWebhook(raw, signature, [connection]);
  const texts = probe.testTexts!;
  const testIndexes: number[] = [];
  for (const value of entries) {
    const entry = record(value);
    if (entry.id !== connection.pageId || !Array.isArray(entry.messaging))
      continue;
    for (const value of entry.messaging) {
      const index = texts.indexOf(record(record(value).message).text as string);
      if (index >= 0) testIndexes.push(index);
    }
  }
  if (!testIndexes.length) return null;
  const base = {
    receivedAt: new Date(now).toISOString(),
    bodyHash: createHash('sha256').update(raw).digest('hex'),
    testIndexes: [...new Set(testIndexes)],
  };
  const exclusive = entries.every((value) => {
    const entry = record(value);
    if (
      entry.id !== connection.pageId ||
      'changes' in entry ||
      'standby' in entry ||
      !Array.isArray(entry.messaging) ||
      !entry.messaging.length ||
      entry.messaging.length > 20
    )
      return false;
    return entry.messaging.every((value) => {
      const event = record(value);
      const message = record(event.message);
      return (
        record(event.recipient).id === connection.pageId &&
        typeof record(event.sender).id === 'string' &&
        record(event.sender).id !== connection.pageId &&
        typeof message.mid === 'string' &&
        !!message.mid &&
        message.is_echo !== true &&
        texts.includes(message.text as string) &&
        ![
          'delivery',
          'read',
          'postback',
          'reaction',
          'optin',
          'account_linking',
        ].some((key) => key in event)
      );
    });
  });
  if (!exclusive) return { ...base, status: 'skipped', reason: 'MIXED_BATCH' };
  if (raw.length > 128 * 1024)
    return { ...base, status: 'skipped', reason: 'TOO_LARGE' };
  const rawJson = raw.toString('utf8');
  if (!Buffer.from(rawJson, 'utf8').equals(raw))
    return { ...base, status: 'skipped', reason: 'INVALID_UTF8' };
  return { ...base, status: 'captured', rawJson };
}
