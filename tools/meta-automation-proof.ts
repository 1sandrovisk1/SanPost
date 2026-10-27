import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FacebookCommentAutomationAdapter } from '../libraries/nestjs-libraries/src/integrations/automations/facebook-comment-automation.adapter';
import {
  FileProofLedger,
  MetaProofConfig,
  MetaProofRequest,
  runMetaAutomationProof,
} from '../libraries/nestjs-libraries/src/integrations/automations/meta-automation-proof';
import {
  MetaAutomationError,
  record,
} from '../libraries/nestjs-libraries/src/integrations/automations/meta-automation-graph.client';

async function readPrivateFile(
  path: string,
  limit = 1024 * 1024
): Promise<Buffer> {
  const info = await stat(path);
  if (
    !info.isFile() ||
    info.size > limit ||
    (process.platform !== 'win32' && (info.mode & 0o077) !== 0)
  ) {
    throw new Error('PRIVATE_FILE_REQUIRED');
  }
  return readFile(path);
}

async function main() {
  const [mode, configPath, rawPath, signaturePath, replyPath, ...extra] =
    process.argv.slice(2);
  if (mode === '--help' || !mode) {
    process.stdout.write(
      'Uso: pnpm automations:meta-proof inspect <credenciais.json>\n' +
        '     pnpm automations:meta-proof verify-webhook <credenciais.json> <body.json> <assinatura.txt>\n' +
        '     pnpm automations:meta-proof send-private <credenciais.json> <body.json> <assinatura.txt> <mensagem.json>\n' +
        'Arquivos locais privados (chmod 600). send-private envia UMA mensagem real e reserva o comentario.\n'
    );
    return;
  }
  if (
    extra.length ||
    !['inspect', 'verify-webhook', 'send-private'].includes(mode) ||
    !configPath ||
    (mode === 'inspect' && (rawPath || signaturePath || replyPath)) ||
    (mode !== 'inspect' && (!rawPath || !signaturePath)) ||
    (mode === 'verify-webhook' && replyPath) ||
    (mode === 'send-private' && !replyPath)
  )
    throw new Error('INVALID_PROOF_ARGUMENTS');
  const data = record(
    JSON.parse((await readPrivateFile(configPath, 16384)).toString('utf8'))
  );
  const keys = [
    'pageId',
    'appId',
    'pageAccessToken',
    'appAccessToken',
    'appSecret',
    'integrationId',
    'organizationId',
    'profileId',
  ];
  if (
    keys.some(
      (key) => typeof data[key] !== 'string' || !(data[key] as string).trim()
    )
  )
    throw new Error('INVALID_PROOF_CONFIG');
  const config = Object.fromEntries(
    keys.map((key) => [key, data[key]])
  ) as unknown as MetaProofConfig;
  const input: MetaProofRequest = {
    mode: mode as MetaProofRequest['mode'],
    config,
    now: Date.now(),
  };
  if (rawPath)
    input.sample = {
      rawBody: await readPrivateFile(rawPath),
      signature: (await readPrivateFile(signaturePath, 128))
        .toString('utf8')
        .trim(),
    };
  if (replyPath) {
    const reply = record(
      JSON.parse((await readPrivateFile(replyPath, 16384)).toString('utf8'))
    );
    const button = record(reply.button);
    input.reply = {
      commentId: reply.commentId as string,
      text: reply.text as string,
      ...(reply.button
        ? {
            button: {
              title: button.title as string,
              url: button.url as string,
            },
          }
        : {}),
    };
  }
  const result = await runMetaAutomationProof(
    input,
    new FacebookCommentAutomationAdapter(),
    new FileProofLedger(resolve('.secrets/meta-automation-proof-ledger'))
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (
    ('status' in result && result.status === 'BLOCKED') ||
    ('delivery' in result && result.delivery.status !== 'SENT')
  )
    process.exitCode = 1;
}

main().catch((error: unknown) => {
  // Never print request URLs, credentials, raw upstream errors or file contents.
  const safeCodes = [
    'PRIVATE_FILE_REQUIRED',
    'INVALID_PROOF_ARGUMENTS',
    'INVALID_PROOF_CONFIG',
    'WEBHOOK_SAMPLE_REQUIRED',
    'INVALID_PROOF_MODE',
    'COMMENT_NOT_VERIFIED',
    'PREFLIGHT_BLOCKED',
    'PROOF_ALREADY_RESERVED',
    'PROOF_LEDGER_UNAVAILABLE',
    'PROOF_LEDGER_RESULT_UNKNOWN',
  ];
  const message =
    error instanceof MetaAutomationError
      ? error.category
      : error instanceof Error && safeCodes.includes(error.message)
      ? error.message
      : 'PROOF_FAILED';
  process.stderr.write(
    `${JSON.stringify({
      error: message,
      ...(error instanceof MetaAutomationError
        ? {
            code: error.code,
            subcode: error.subcode,
            httpStatus: error.httpStatus,
          }
        : {}),
    })}\n`
  );
  process.exitCode = 1;
});
