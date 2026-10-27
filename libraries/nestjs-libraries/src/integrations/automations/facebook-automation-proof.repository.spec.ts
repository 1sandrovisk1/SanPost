import 'reflect-metadata';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FacebookAutomationProofRepository } from './facebook-automation-proof.repository';
import { FileProofLedger } from './meta-automation-proof';

describe('FacebookAutomationProofRepository', () => {
  let root: string, directory: string, repo: FacebookAutomationProofRepository;
  const config = {
    organizationId: 'org',
    profileId: 'profile',
    integrationId: 'integration',
    appId: '456',
    pageId: '123',
    postId: '123_789',
    commentId: '789_321',
    text: 'Teste',
    ledgerId: 'a'.repeat(64),
  };
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fb-proof-'));
    directory = join(root, 'ledger');
    await mkdir(directory);
    process.env.FACEBOOK_AUTOMATION_PROOF_CONFIG = join(root, 'config.json');
    process.env.FACEBOOK_AUTOMATION_PROOF_DIR = directory;
    await writeFile(
      process.env.FACEBOOK_AUTOMATION_PROOF_CONFIG,
      JSON.stringify(config),
      { mode: 0o600 }
    );
    await writeFile(join(directory, '.ledger-id'), config.ledgerId);
    repo = new FacebookAutomationProofRepository();
  });
  afterEach(async () => {
    delete process.env.FACEBOOK_AUTOMATION_PROOF_CONFIG;
    delete process.env.FACEBOOK_AUTOMATION_PROOF_DIR;
    await rm(root, { recursive: true, force: true });
  });
  it('config opt-in sem access token e ausencia desativa', async () => {
    expect(await repo.config()).toEqual(config);
    delete process.env.FACEBOOK_AUTOMATION_PROOF_CONFIG;
    expect(await repo.config()).toBeNull();
  });
  it('rejeita config de post de outra pagina', async () => {
    await writeFile(
      process.env.FACEBOOK_AUTOMATION_PROOF_CONFIG!,
      JSON.stringify({ ...config, postId: '999_789' })
    );
    await expect(repo.config()).rejects.toThrow();
  });
  it('volume ausente ou marcador errado falha fechado', async () => {
    await rm(directory, { recursive: true });
    await expect(repo.read(config)).rejects.toThrow();
    await expect(repo.reserve(config)).rejects.toThrow();
    await mkdir(directory);
    await writeFile(join(directory, '.ledger-id'), 'other');
    await expect(repo.read(config)).rejects.toThrow();
  });
  it('somente arquivo ausente em volume valido permite tentativa', async () => {
    expect(await repo.read(config)).toBeNull();
  });
  it.each(['', '{', '{"status":"SENDING"}\n{', '{"status":"OTHER"}\n'])(
    'arquivo invalido bloqueia: %s',
    async (body) => {
      await writeFile(
        new FileProofLedger(directory).pathFor(config.pageId, config.commentId),
        body
      );
      expect(await repo.read(config)).toMatchObject({ status: 'UNKNOWN' });
      await expect(repo.reserve(config)).rejects.toThrow();
    }
  );
  it('reserva exclusiva persiste entre instancias e compartilha CLI', async () => {
    const results = await Promise.allSettled([
      repo.reserve(config),
      repo.reserve(config),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await new FacebookAutomationProofRepository().read(config)
    ).toMatchObject({ status: 'SENDING' });
    await expect(
      new FileProofLedger(directory).reserve(config.pageId, config.commentId)
    ).rejects.toThrow('PROOF_ALREADY_RESERVED');
    await repo.complete(config, { status: 'SENT', remoteId: 'mid.123' });
    expect(await repo.read(config)).toMatchObject({
      status: 'SENT',
      remoteId: 'mid.123',
    });
  });
  it('projeta somente resultado seguro sem dados extras', async () => {
    await repo.reserve(config);
    await repo.complete(config, {
      status: 'FAILED',
      error: { category: 'TOKEN_INVALID', code: 190, subcode: 464 },
    });
    const result = await repo.read(config);
    expect(result).toMatchObject({ status: 'FAILED', code: 190, subcode: 464 });
    expect(JSON.stringify(result)).not.toContain('error');
  });
  it('falha ao persistir mantem reserva em nova instancia', async () => {
    await repo.reserve(config);
    await rm(join(directory, '.ledger-id'));
    await expect(
      repo.complete(config, { status: 'SENT', remoteId: 'mid.123' })
    ).rejects.toThrow();
    await writeFile(join(directory, '.ledger-id'), config.ledgerId);
    const restarted = new FacebookAutomationProofRepository();
    expect(await restarted.read(config)).toMatchObject({ status: 'SENDING' });
    await expect(restarted.reserve(config)).rejects.toThrow(
      'PROOF_ALREADY_RESERVED'
    );
  });
});
