import { mkdtemp, readFile, rm } from 'node:fs/promises';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHmac } from 'node:crypto';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { FacebookCommentAutomationAdapter } from './facebook-comment-automation.adapter';
import {
  runMetaAutomationProof,
  FileProofLedger,
  MetaProofConfig,
} from './meta-automation-proof';

const now = Date.parse('2026-10-19T12:00:00Z');
const config: MetaProofConfig = {
  pageId: '123',
  appId: '456',
  pageAccessToken: 'PAGE_SECRET',
  appAccessToken: 'APP_SECRET',
  appSecret: 'HMAC_SECRET',
  integrationId: 'integration',
  organizationId: 'org',
  profileId: 'profile',
};
const raw = Buffer.from(
  JSON.stringify({
    object: 'page',
    entry: [
      {
        id: '123',
        changes: [
          {
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              post_id: '123_10',
              parent_id: '123_10',
              comment_id: '10_20',
              from: { id: '90' },
              created_time: now / 1000 - 60,
              message: 'PRIVATE_USER_TEXT',
            },
          },
        ],
      },
    ],
  })
);
const sample = {
  rawBody: raw,
  signature: `sha256=${createHmac('sha256', config.appSecret)
    .update(raw)
    .digest('hex')}`,
};
const reply = { commentId: '10_20', text: 'Seu link https://example.com' };

describe('runMetaAutomationProof', () => {
  let dir: string;
  let adapter: ReturnType<typeof createMock<FacebookCommentAutomationAdapter>>;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'multipost-meta-proof-'));
    adapter = createMock<FacebookCommentAutomationAdapter>();
    adapter.inspect.mockResolvedValue({
      status: 'PREFLIGHT_PASSED',
      reasons: [],
      missingPermissions: [],
      liveProofRequired: true,
      posts: [],
    });
    adapter.sendPrivateReply.mockResolvedValue({
      status: 'SENT',
      remoteId: 'mid.1',
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });
  const makeLedger = () => new FileProofLedger(dir);

  it('nao envia quando nao consegue tornar duravel a criacao da reserva', async () => {
    const originalOpen = fs.open;
    jest.spyOn(fs, 'open').mockImplementation(async (...args) => {
      const handle = await originalOpen(...args);
      if (args[0] === dir) {
        jest.spyOn(handle, 'sync').mockRejectedValue(new Error('disk failure'));
      }
      return handle;
    });
    await expect(
      runMetaAutomationProof(
        { mode: 'send-private', config, sample, reply, now },
        adapter,
        makeLedger()
      )
    ).rejects.toThrow();
    expect(adapter.sendPrivateReply).not.toHaveBeenCalled();
  });

  it('modo inspect nunca envia mensagem', async () => {
    const result = await runMetaAutomationProof(
      { mode: 'inspect', config, now },
      adapter,
      makeLedger()
    );
    expect(result).toMatchObject({
      mode: 'inspect',
      status: 'PREFLIGHT_PASSED',
    });
    expect(adapter.sendPrivateReply).not.toHaveBeenCalled();
  });

  it('verificacao de webhook e offline e nao mostra texto ou autor', async () => {
    const result = await runMetaAutomationProof(
      { mode: 'verify-webhook', config, sample, now },
      adapter,
      makeLedger()
    );
    expect(result).toMatchObject({ mode: 'verify-webhook', acceptedCount: 1 });
    expect(JSON.stringify(result)).not.toMatch(
      /SECRET|PRIVATE_USER_TEXT|externalActorId/
    );
    expect(adapter.inspect).not.toHaveBeenCalled();
    expect(adapter.sendPrivateReply).not.toHaveBeenCalled();
  });

  it('envia somente comentario verificado e preserva recibo antes de sair', async () => {
    const ledger = makeLedger();
    const result = await runMetaAutomationProof(
      { mode: 'send-private', config, sample, reply, now },
      adapter,
      ledger
    );
    expect(result).toMatchObject({
      mode: 'send-private',
      delivery: { status: 'SENT', remoteId: 'mid.1' },
    });
    expect(adapter.sendPrivateReply).toHaveBeenCalledWith(
      config,
      { ...reply, occurredAt: now - 60000 },
      now
    );
    expect(await readFile(ledger.pathFor('123', '10_20'), 'utf8')).toContain(
      'SENT'
    );
  });

  it('duas provas concorrentes ou outro perfil nao duplicam a resposta privada', async () => {
    const requests = [config, { ...config, profileId: 'other-profile' }].map(
      (credentials) =>
        runMetaAutomationProof(
          {
            mode: 'send-private',
            config: credentials,
            sample,
            reply,
            now,
          },
          adapter,
          makeLedger()
        )
    );
    const results = await Promise.allSettled(requests);
    expect(
      results.filter((result) => result.status === 'fulfilled')
    ).toHaveLength(1);
    expect(adapter.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it('nao repete resultado desconhecido nem apos recriar o ledger', async () => {
    adapter.sendPrivateReply.mockResolvedValue({
      status: 'UNKNOWN',
      error: { category: 'OUTCOME_UNKNOWN' },
    });
    await runMetaAutomationProof(
      { mode: 'send-private', config, sample, reply, now },
      adapter,
      makeLedger()
    );
    await expect(
      runMetaAutomationProof(
        { mode: 'send-private', config, sample, reply, now },
        adapter,
        makeLedger()
      )
    ).rejects.toThrow('PROOF_ALREADY_RESERVED');
    expect(adapter.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it('falha antes da resposta do adapter deixa reserva que bloqueia reenvio', async () => {
    adapter.sendPrivateReply.mockRejectedValue(new Error('SECRET'));
    await expect(
      runMetaAutomationProof(
        { mode: 'send-private', config, sample, reply, now },
        adapter,
        makeLedger()
      )
    ).rejects.toThrow('OUTCOME_UNKNOWN');
    expect(
      await readFile(makeLedger().pathFor('123', '10_20'), 'utf8')
    ).toContain('SENDING');
    await expect(
      runMetaAutomationProof(
        { mode: 'send-private', config, sample, reply, now },
        adapter,
        makeLedger()
      )
    ).rejects.toThrow('PROOF_ALREADY_RESERVED');
    expect(adapter.sendPrivateReply).toHaveBeenCalledTimes(1);
  });

  it('preflight bloqueado nao cria reserva nem envia', async () => {
    adapter.inspect.mockResolvedValue({
      status: 'BLOCKED',
      reasons: ['PERMISSIONS_MISSING'],
      missingPermissions: ['pages_messaging'],
      liveProofRequired: true,
      posts: [],
    });
    await expect(
      runMetaAutomationProof(
        { mode: 'send-private', config, sample, reply, now },
        adapter,
        makeLedger()
      )
    ).rejects.toThrow('PREFLIGHT_BLOCKED');
    expect(adapter.sendPrivateReply).not.toHaveBeenCalled();
  });

  it('nao aceita um comment_id que nao veio da Page assinada', async () => {
    await expect(
      runMetaAutomationProof(
        {
          mode: 'send-private',
          config,
          sample,
          reply: { ...reply, commentId: '999_9' },
          now,
        },
        adapter,
        makeLedger()
      )
    ).rejects.toThrow('COMMENT_NOT_VERIFIED');
    expect(adapter.sendPrivateReply).not.toHaveBeenCalled();
  });

  it('payload invalido nao consome reserva de comentario', async () => {
    await expect(
      runMetaAutomationProof(
        {
          mode: 'send-private',
          config,
          sample,
          reply: { ...reply, text: '' },
          now,
        },
        adapter,
        makeLedger()
      )
    ).rejects.toThrow('INVALID_INPUT');
    await expect(
      readFile(makeLedger().pathFor('123', '10_20'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
