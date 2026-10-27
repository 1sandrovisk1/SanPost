import { createHmac } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(__dirname, '../../../../..');
const tool = join(root, 'tools/meta-automation-proof.ts');
const loader = require.resolve('ts-node/register');

describe('meta-automation-proof CLI offline', () => {
  let directory: string;
  let credentials: string;
  let rawPath: string;
  let signaturePath: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'multipost-proof-cli-'));
    credentials = join(directory, 'credentials.json');
    rawPath = join(directory, 'webhook.json');
    signaturePath = join(directory, 'signature.txt');
    writeFileSync(
      credentials,
      JSON.stringify({
        pageId: '123',
        appId: '456',
        pageAccessToken: 'PAGE_SECRET',
        appAccessToken: 'APP_SECRET',
        appSecret: 'HMAC_SECRET',
        integrationId: 'integration',
        organizationId: 'org',
        profileId: 'profile',
      }),
      { mode: 0o600 }
    );
    const raw = JSON.stringify({
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
                created_time: Math.floor(Date.now() / 1000) - 60,
                message: 'PRIVATE_USER_TEXT',
              },
            },
          ],
        },
      ],
    });
    writeFileSync(rawPath, raw, { mode: 0o600 });
    writeFileSync(
      signaturePath,
      `sha256=${createHmac('sha256', 'HMAC_SECRET').update(raw).digest('hex')}`,
      { mode: 0o600 }
    );
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });
  function run(args: string[]) {
    return spawnSync(process.execPath, ['-r', loader, tool, ...args], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 20000,
      env: {
        ...process.env,
        TS_NODE_PROJECT: join(root, 'tools/tsconfig.meta-proof.json'),
      },
    });
  }

  it('help funciona sem conta, banco ou Temporal', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('inspect');
    expect(result.stderr).toBe('');
  });

  it('valida bytes assinados em processo real sem imprimir dados pessoais', () => {
    const result = run(['verify-webhook', credentials, rawPath, signaturePath]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      acceptedCount: 1,
      comments: [{ commentId: '10_20', postId: '123_10' }],
    });
    expect(result.stdout + result.stderr).not.toMatch(
      /SECRET|PRIVATE_USER_TEXT/
    );
  });

  it('recusa arquivo de credenciais legivel por outros usuarios antes do HTTP', () => {
    chmodSync(credentials, 0o644);
    const result = run(['inspect', credentials]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PRIVATE_FILE_REQUIRED');
    expect(result.stderr).not.toContain(credentials);
  });

  it('recusa envio para comentario ausente na captura sem consultar Meta', () => {
    const messagePath = join(directory, 'message.json');
    writeFileSync(
      messagePath,
      JSON.stringify({ commentId: '99_99', text: 'hello' }),
      { mode: 0o600 }
    );
    const result = run([
      'send-private',
      credentials,
      rawPath,
      signaturePath,
      messagePath,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('COMMENT_NOT_VERIFIED');
  });

  it('JSON invalido nao vaza seu conteudo no erro', () => {
    writeFileSync(credentials, '{"token":"SECRET_INVALID_JSON');
    const result = run(['inspect', credentials]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PROOF_FAILED');
    expect(result.stderr).not.toContain('SECRET');
  });
});
