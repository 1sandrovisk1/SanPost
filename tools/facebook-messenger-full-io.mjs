import { createDecipheriv, createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

// Kept self-contained so the same function runs inside the local container;
// the encryption key and decrypted content are never printed by the CLI.
export function decryptCapture(row, keySource, scope, nonce) {
  if (!keySource?.trim() || row.status !== 'captured')
    throw new Error('CAPTURE_INVALID');
  const bytes = Buffer.from(row.encryptedJson, 'base64');
  if (bytes[0] !== 1 || bytes.length < 30) throw new Error('CAPTURE_INVALID');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    createHash('sha256').update(keySource).digest(),
    bytes.subarray(1, 13)
  );
  decipher.setAuthTag(bytes.subarray(13, 29));
  const value = JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(29)),
      decipher.final(),
    ]).toString('utf8')
  );
  if (
    value.nonce !== nonce ||
    Object.keys(scope).some((key) => value[key] !== scope[key]) ||
    typeof value.rawJson !== 'string' ||
    createHash('sha256').update(value.rawJson).digest('hex') !== row.bodyHash
  )
    throw new Error('CAPTURE_INVALID');
  return value.rawJson;
}

export function exportCaptures(records, nonce, directory) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('CAPTURE_INVALID');
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  return records
    .filter((row) => row.status === 'captured')
    .map((row) => {
      if (
        !/^[a-f0-9]{64}$/.test(row.bodyHash) ||
        typeof row.rawJson !== 'string' ||
        createHash('sha256').update(row.rawJson).digest('hex') !== row.bodyHash
      )
        throw new Error('CAPTURE_INVALID');
      const path = join(directory, `messenger-${nonce}-${row.bodyHash}.json`);
      try {
        writeFileSync(path, row.rawJson, { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const existing = fstatSync(fd);
          if (
            !existing.isFile() ||
            existing.mode & 0o077 ||
            !readFileSync(fd).equals(Buffer.from(row.rawJson, 'utf8'))
          )
            throw new Error('EXISTING_CAPTURE_INVALID');
        } finally {
          closeSync(fd);
        }
      }
      return path;
    });
}
