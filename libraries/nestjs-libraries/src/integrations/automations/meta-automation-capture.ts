import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { Writable } from 'node:stream';
import {
  FacebookWebhookContext,
  parseFacebookCommentWebhook,
} from './facebook-automation-webhook';

export interface CaptureConfig extends FacebookWebhookContext {
  appId: string;
  verifyToken: string;
}

export interface CaptureObservation {
  appId: string;
  expectedPageId: string;
  pageIds: string[];
  entryCount: number;
  decision:
    | 'CAPTURED'
    | 'DUPLICATE'
    | 'IGNORED_OTHER_PAGE'
    | 'IGNORED_MIXED_PAGES';
}

/** Best-effort diagnostics: no bodies, credentials or unbounded stream buffering. */
export function createCaptureDiagnosticWriter(output: Writable) {
  let failed = false;
  output.on('error', () => {
    failed = true;
  });
  return (observation: CaptureObservation) => {
    if (failed || output.destroyed || output.writableLength >= 65536) return;
    try {
      output.write(
        `${JSON.stringify({ event: 'META_PAGE_WEBHOOK', ...observation })}\n`,
        (error) => {
          if (error) failed = true;
        }
      );
    } catch {
      failed = true;
    }
  };
}

const BODY_LIMIT = 1024 * 1024;
const WEBHOOK_PATH = '/public/fb-webhook-proof';
const CONTEXT_KEYS = [
  'pageId',
  'appId',
  'integrationId',
  'organizationId',
  'profileId',
] as const;
const CONFIG_KEYS = [...CONTEXT_KEYS, 'appSecret', 'verifyToken'] as const;

function validateConfig(value: CaptureConfig): CaptureConfig {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      (key) => !CONFIG_KEYS.some((field) => field === key)
    ) ||
    CONFIG_KEYS.some(
      (key) =>
        typeof value[key] !== 'string' ||
        !value[key].trim() ||
        value[key].length > 256
    ) ||
    !/^\d+$/.test(value.pageId) ||
    !/^\d+$/.test(value.appId) ||
    !/^[a-f0-9]{64}$/.test(value.verifyToken)
  ) {
    throw new Error('INVALID_CAPTURE_CONFIG');
  }
  return Object.freeze({ ...value });
}

async function privateDirectory(path: string) {
  const info = await lstat(path);
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (info.mode & 0o077) !== 0 ||
    (await realpath(path)) !== resolve(path)
  )
    throw new Error('PRIVATE_DIRECTORY_REQUIRED');
}

async function privateFile(path: string, limit: number) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit || (info.mode & 0o077) !== 0)
      throw new Error('PRIVATE_FILE_REQUIRED');
    return await file.readFile();
  } finally {
    await file.close();
  }
}

export async function loadCaptureConfig(path: string): Promise<CaptureConfig> {
  await privateDirectory(dirname(resolve(path)));
  return validateConfig(
    JSON.parse((await privateFile(path, 16384)).toString('utf8'))
  );
}

async function syncDirectory(path: string) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

async function writePrivate(path: string, value: Buffer | string) {
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(value);
    await file.sync();
  } finally {
    await file.close();
  }
}

/** Single-process, bounded proof capture; deliberately has no DB or send capability. */
export class FileCaptureStore {
  private tail: Promise<unknown> = Promise.resolve();
  private constructor(
    private readonly directory: string,
    private readonly maxCaptures: number
  ) {}

  static async open(directory: string, maxCaptures = 100) {
    if (!Number.isInteger(maxCaptures) || maxCaptures < 1 || maxCaptures > 100)
      throw new Error('INVALID_CAPTURE_QUOTA');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await privateDirectory(directory);
    await syncDirectory(directory);
    await syncDirectory(dirname(resolve(directory)));
    return new FileCaptureStore(resolve(directory), maxCaptures);
  }

  save(
    config: CaptureConfig,
    raw: Buffer,
    signature: string,
    acceptedComments: number | null
  ) {
    const task = this.tail.then(() =>
      this.persist(config, raw, signature, acceptedComments)
    );
    this.tail = task.catch(() => undefined);
    return task;
  }

  private async persist(
    config: CaptureConfig,
    raw: Buffer,
    signature: string,
    acceptedComments: number | null
  ) {
    await privateDirectory(this.directory);
    const key = createHash('sha256').update(raw).digest('hex');
    const destination = join(this.directory, key);
    const names = await readdir(this.directory);
    if (names.includes(key)) {
      await privateDirectory(destination);
      const previous = await privateFile(
        join(destination, 'webhook.json'),
        BODY_LIMIT
      );
      const previousSignature = await privateFile(
        join(destination, 'signature.txt'),
        128
      );
      const metadata = JSON.parse(
        (await privateFile(join(destination, 'metadata.json'), 8192)).toString(
          'utf8'
        )
      );
      if (
        !previous.equals(raw) ||
        previousSignature.toString('utf8') !== signature ||
        CONTEXT_KEYS.some((field) => metadata[field] !== config[field])
      )
        throw new Error('CAPTURE_INCOMPLETE');
      await syncDirectory(destination);
      await syncDirectory(this.directory);
      return 'DUPLICATE' as const;
    }
    // Includes orphaned temporary directories: crashes cannot bypass the quota.
    if (names.length >= this.maxCaptures)
      throw new Error('CAPTURE_QUOTA_REACHED');
    const temporary = await mkdtemp(
      join(this.directory, `.pending-${randomBytes(4).toString('hex')}-`)
    );
    try {
      await writePrivate(join(temporary, 'webhook.json'), raw);
      await writePrivate(join(temporary, 'signature.txt'), signature);
      await writePrivate(
        join(temporary, 'metadata.json'),
        JSON.stringify({
          version: 1,
          ...Object.fromEntries(
            CONTEXT_KEYS.map((field) => [field, config[field]])
          ),
          receivedAt: new Date().toISOString(),
          acceptedComments,
        })
      );
      await syncDirectory(temporary);
      await rename(temporary, destination);
      await syncDirectory(this.directory);
      return 'CAPTURED' as const;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

class CaptureHttpError extends Error {
  constructor(readonly status: number, readonly publicCode: string) {
    super(publicCode);
  }
}

function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    let rejected = false;
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        rejected = true;
        chunks.length = 0;
        reject(new CaptureHttpError(413, 'BODY_TOO_LARGE'));
      } else chunks.push(chunk);
    });
    request.once('end', () => {
      if (!rejected) resolveBody(Buffer.concat(chunks));
    });
    request.once('error', () =>
      reject(new CaptureHttpError(400, 'INVALID_REQUEST'))
    );
    request.once('aborted', () =>
      reject(new CaptureHttpError(400, 'INVALID_REQUEST'))
    );
  });
}

function respond(response: ServerResponse, status: number, text: string) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    Connection: 'close',
  });
  response.end(text);
}

function equalSecret(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createCaptureServer(
  input: CaptureConfig,
  store: FileCaptureStore,
  observe?: (observation: CaptureObservation) => void | Promise<void>
) {
  const config = validateConfig(input);
  let active = 0;
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const run = async () => {
      const url = new URL(request.url || '/', 'http://capture.invalid');
      if (url.pathname === '/health' && request.method === 'GET')
        return respond(response, 200, 'OK');
      if (url.pathname !== WEBHOOK_PATH)
        return respond(response, 404, 'NOT_FOUND');
      if (request.method === 'GET') {
        const params = url.searchParams;
        if (
          ['hub.mode', 'hub.verify_token', 'hub.challenge'].some(
            (key) => params.getAll(key).length !== 1
          ) ||
          params.get('hub.mode') !== 'subscribe' ||
          !equalSecret(
            params.get('hub.verify_token') || '',
            config.verifyToken
          ) ||
          !/^\d{1,100}$/.test(params.get('hub.challenge') || '')
        )
          return respond(response, 403, 'VERIFICATION_FAILED');
        return respond(response, 200, params.get('hub.challenge')!);
      }
      if (request.method !== 'POST')
        return respond(response, 405, 'METHOD_NOT_ALLOWED');
      if (active >= 8) return respond(response, 429, 'BUSY');
      active++;
      try {
        if (
          request.headers['content-encoding'] ||
          !/^application\/json(?:\s*;.*)?$/i.test(
            request.headers['content-type'] || ''
          )
        )
          throw new CaptureHttpError(415, 'UNSUPPORTED_CONTENT_TYPE');
        if (Number(request.headers['content-length'] || 0) > BODY_LIMIT)
          throw new CaptureHttpError(413, 'BODY_TOO_LARGE');
        const signature = request.headers['x-hub-signature-256'];
        if (
          typeof signature !== 'string' ||
          !/^sha256=[a-f0-9]{64}$/.test(signature)
        )
          throw new CaptureHttpError(401, 'INVALID_SIGNATURE');
        const raw = await readBody(request);
        const digest = createHmac('sha256', config.appSecret)
          .update(raw)
          .digest();
        if (!timingSafeEqual(digest, Buffer.from(signature.slice(7), 'hex')))
          throw new CaptureHttpError(401, 'INVALID_SIGNATURE');
        let body: { object?: unknown; entry?: unknown };
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          throw new CaptureHttpError(400, 'INVALID_JSON');
        }
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new CaptureHttpError(400, 'INVALID_ENVELOPE');
        if (body.object !== 'page') return respond(response, 200, 'IGNORED');
        if (
          !Array.isArray(body.entry) ||
          !body.entry.length ||
          body.entry.length > 100 ||
          body.entry.some(
            (entry) =>
              !entry ||
              typeof entry !== 'object' ||
              Array.isArray(entry) ||
              typeof entry.id !== 'string' ||
              !/^\d{1,32}$/.test(entry.id)
          )
        )
          throw new CaptureHttpError(400, 'INVALID_ENVELOPE');
        const pageIds = [
          ...new Set<string>(body.entry.map((entry) => entry.id)),
        ];
        const entryCount = body.entry.length;
        const report = (decision: CaptureObservation['decision']) => {
          if (!observe) return;
          try {
            Promise.resolve(
              observe({
                appId: config.appId,
                expectedPageId: config.pageId,
                pageIds: [...pageIds],
                entryCount,
                decision,
              })
            ).catch(() => undefined);
          } catch {
            // Diagnostic failure must not change capture durability or HTTP acknowledgement.
          }
        };
        // Reject the WHOLE batch before storing raw bytes if it contains any other Page.
        if (pageIds.some((pageId) => pageId !== config.pageId)) {
          report(
            pageIds.length > 1 ? 'IGNORED_MIXED_PAGES' : 'IGNORED_OTHER_PAGE'
          );
          return respond(response, 200, 'IGNORED');
        }
        let acceptedComments: number | null = null;
        try {
          acceptedComments = parseFacebookCommentWebhook(raw, signature, [
            config,
          ]).events.length;
        } catch {
          /* Preserve scoped signed diagnostics even for an unsupported comment shape. */
        }
        const result = await store.save(
          config,
          raw,
          signature,
          acceptedComments
        );
        report(result);
        return respond(response, 200, result);
      } finally {
        active--;
      }
    };
    run()
      .catch((error: unknown) => {
        respond(
          response,
          error instanceof CaptureHttpError ? error.status : 503,
          error instanceof CaptureHttpError
            ? error.publicCode
            : 'CAPTURE_UNAVAILABLE'
        );
      })
      .finally(() => {
        request.resume();
      });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.timeout = 10000;
  server.maxConnections = 32;
  return server;
}
