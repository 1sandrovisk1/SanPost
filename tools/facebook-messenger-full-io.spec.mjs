import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  statSync,
  rmSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, randomBytes, createHash } from 'node:crypto';
import {
  decryptCapture,
  exportCaptures,
} from './facebook-messenger-full-io.mjs';

const scope = {
  organizationId: 'org',
  profileId: 'profile',
  integrationId: 'integration',
  appId: '456',
  pageId: '123',
};

test('recusa bytes corrompidos, symlinks e permissoes abertas em exportacao repetida', () => {
  const dir = mkdtempSync(join(tmpdir(), 'full-probe-integrity-'));
  const original = '{"value":"�"}';
  const hash = createHash('sha256').update(original).digest('hex');
  const records = [{ status: 'captured', bodyHash: hash, rawJson: original }];
  try {
    const [path] = exportCaptures(records, nonce, dir);
    writeFileSync(
      path,
      Buffer.concat([
        Buffer.from('{"value":"'),
        Buffer.from([0xff]),
        Buffer.from('"}'),
      ])
    );
    assert.throws(() => exportCaptures(records, nonce, dir));
    writeFileSync(path, original);
    chmodSync(path, 0o644);
    assert.throws(() => exportCaptures(records, nonce, dir));
    rmSync(path);
    const target = join(dir, 'target');
    writeFileSync(target, original, { mode: 0o600 });
    symlinkSync(target, path);
    assert.throws(() => exportCaptures(records, nonce, dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const nonce = 'a'.repeat(32);
const rawJson = '{\n "object":"page", "is_story":true, "unknown":"á"\n}';
const bodyHash = createHash('sha256').update(rawJson).digest('hex');
function encrypted() {
  const iv = randomBytes(12);
  const c = createCipheriv(
    'aes-256-gcm',
    createHash('sha256').update('key').digest(),
    iv
  );
  const payload = Buffer.concat([
    c.update(JSON.stringify({ ...scope, nonce, rawJson })),
    c.final(),
  ]);
  return Buffer.concat([
    Buffer.from([1]),
    iv,
    c.getAuthTag(),
    payload,
  ]).toString('base64');
}
test('decifra somente a sessao e escopo corretos, validando hash e autenticidade', () => {
  const row = { status: 'captured', bodyHash, encryptedJson: encrypted() };
  assert.equal(decryptCapture(row, 'key', scope, nonce), rawJson);
  for (const args of [
    [row, 'wrong', scope, nonce],
    [row, '', scope, nonce],
    [row, 'key', { ...scope, profileId: 'other' }, nonce],
    [row, 'key', scope, 'b'.repeat(32)],
    [{ ...row, bodyHash: 'b'.repeat(64) }, 'key', scope, nonce],
  ]) {
    assert.throws(() => decryptCapture(...args));
  }
});
test('exporta bytes completos em arquivo 600 e nunca sobrescreve arquivo existente', () => {
  const dir = mkdtempSync(join(tmpdir(), 'full-probe-test-'));
  try {
    const records = [{ status: 'captured', bodyHash, rawJson }];
    const files = exportCaptures(records, nonce, dir);
    assert.equal(readFileSync(files[0], 'utf8'), rawJson);
    assert.equal(statSync(files[0]).mode & 0o777, 0o600);
    assert.deepEqual(exportCaptures(records, nonce, dir), files);
    writeFileSync(files[0], 'different content');
    assert.throws(() => exportCaptures(records, nonce, dir));
    assert.equal(readFileSync(files[0], 'utf8'), 'different content');
    assert.throws(() => exportCaptures(records, '../unsafe', dir));
    assert.throws(() =>
      exportCaptures([{ ...records[0], bodyHash: '../unsafe' }], nonce, dir)
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
