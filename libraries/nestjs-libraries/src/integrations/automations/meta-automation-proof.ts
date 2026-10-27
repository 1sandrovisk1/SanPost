import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  FacebookAutomationConnection,
  FacebookCommentAutomationAdapter,
  FacebookPrivateReply,
  validateFacebookPrivateReply,
} from './facebook-comment-automation.adapter';
import {
  FacebookWebhookContext,
  parseFacebookCommentWebhook,
} from './facebook-automation-webhook';
import {
  MetaAutomationDelivery,
  MetaAutomationError,
} from './meta-automation-graph.client';

export type MetaProofConfig = FacebookAutomationConnection &
  FacebookWebhookContext;
export interface MetaProofRequest {
  mode: 'inspect' | 'verify-webhook' | 'send-private';
  config: MetaProofConfig;
  now: number;
  sample?: { rawBody: Buffer; signature: string };
  reply?: Omit<FacebookPrivateReply, 'occurredAt'>;
}

/** Local-only proof ledger. Production V2 needs a database reservation, not this file implementation. */
export class FileProofLedger {
  constructor(private readonly directory: string) {}

  pathFor(pageId: string, commentId: string): string {
    const key = createHash('sha256')
      .update(JSON.stringify(['facebook', pageId, commentId, 'private_reply']))
      .digest('hex');
    return join(this.directory, `${key}.jsonl`);
  }

  async reserve(pageId: string, commentId: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let file: Awaited<ReturnType<typeof open>>;
    try {
      file = await open(this.pathFor(pageId, commentId), 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new Error('PROOF_ALREADY_RESERVED');
      throw new Error('PROOF_LEDGER_UNAVAILABLE');
    }
    try {
      await file.writeFile('{"status":"SENDING"}\n');
      await file.sync();
    } finally {
      await file.close();
    }
    // A synced file can still lose its directory entry after a power loss.
    // Also sync ancestors: mkdir(recursive) may have created .secrets itself.
    // Unsupported filesystems fail closed here, before any remote mutation.
    let directory = resolve(this.directory);
    for (;;) {
      const parent = await open(directory, 'r');
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
      const next = dirname(directory);
      if (next === directory) break;
      directory = next;
    }
  }

  async complete(
    pageId: string,
    commentId: string,
    result: MetaAutomationDelivery
  ): Promise<void> {
    const file = await open(this.pathFor(pageId, commentId), 'a', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(result)}\n`);
      await file.sync();
    } finally {
      await file.close();
    }
  }
}

export async function runMetaAutomationProof(
  input: MetaProofRequest,
  adapter: FacebookCommentAutomationAdapter,
  ledger: FileProofLedger
) {
  if (input.mode === 'inspect')
    return {
      mode: input.mode,
      ...(await adapter.inspect(input.config, input.now)),
    };
  if (!input.sample) throw new Error('WEBHOOK_SAMPLE_REQUIRED');
  const parsed = parseFacebookCommentWebhook(
    input.sample.rawBody,
    input.sample.signature,
    [input.config]
  );
  if (input.mode === 'verify-webhook')
    return {
      mode: input.mode,
      acceptedCount: parsed.events.length,
      ignoredCount: parsed.ignoredCount,
      rejectedEntryCount: parsed.rejectedEntryCount,
      comments: parsed.events.map((event) => ({
        commentId: event.externalEventId,
        postId: event.externalPostId,
        occurredAt: event.occurredAt,
      })),
    };
  if (input.mode !== 'send-private' || !input.reply)
    throw new Error('INVALID_PROOF_MODE');
  const events = parsed.events.filter(
    (event) => event.externalEventId === input.reply.commentId
  );
  if (events.length !== 1) throw new Error('COMMENT_NOT_VERIFIED');
  const reply = { ...input.reply, occurredAt: events[0].occurredAt };
  validateFacebookPrivateReply(reply, input.now);
  const inspection = await adapter.inspect(input.config, input.now);
  if (inspection.status !== 'PREFLIGHT_PASSED')
    throw new Error('PREFLIGHT_BLOCKED');
  await ledger.reserve(input.config.pageId, reply.commentId);
  let delivery: MetaAutomationDelivery;
  try {
    delivery = await adapter.sendPrivateReply(input.config, reply, input.now);
  } catch {
    throw new MetaAutomationError('OUTCOME_UNKNOWN');
  }
  try {
    await ledger.complete(input.config.pageId, reply.commentId, delivery);
  } catch {
    throw new Error('PROOF_LEDGER_RESULT_UNKNOWN');
  }
  return { mode: input.mode, delivery, recipientConfirmationRequired: true };
}
