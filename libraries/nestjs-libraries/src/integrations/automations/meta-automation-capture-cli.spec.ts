import { spawn, spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

describe('CLI do receptor Meta isolado', () => {
  const root = resolve(__dirname, '../../../../..');
  const loader = require.resolve('ts-node/register');
  const tool = join(root, 'tools/meta-automation-webhook.ts');
  const env = {
    ...process.env,
    TS_NODE_PROJECT: join(root, 'tools/tsconfig.meta-proof.json'),
  };
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(join(realpathSync(tmpdir()), 'fb-capture-cli-'));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('help e erros de configuracao nao dependem do produto nem expoem conteudo', () => {
    const help = spawnSync(process.execPath, ['-r', loader, tool, '--help'], {
      env,
      encoding: 'utf8',
      timeout: 20000,
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Nao envia mensagens');
    const path = join(directory, 'config.json');
    writeFileSync(path, '{"secret":"DO_NOT_PRINT', { mode: 0o600 });
    const result = spawnSync(
      process.execPath,
      ['-r', loader, tool, path, join(directory, 'captures')],
      { env, encoding: 'utf8', timeout: 20000 }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('CAPTURE_START_FAILED\n');
    expect(result.stdout + result.stderr).not.toContain('DO_NOT_PRINT');
  }, 45000);

  it('inicia com configuracao privada e encerra por SIGTERM sem handles pendentes', async () => {
    const reservation = createServer();
    await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((done) => reservation.close(() => done()));
    const path = join(directory, 'config.json');
    writeFileSync(
      path,
      JSON.stringify({
        pageId: '123',
        appId: '456',
        integrationId: 'integration',
        organizationId: 'org',
        profileId: 'profile',
        appSecret: 'TEST_SECRET',
        verifyToken: 'a'.repeat(64),
      }),
      { mode: 0o600 }
    );
    const child = spawn(
      process.execPath,
      [
        '-r',
        loader,
        tool,
        path,
        join(directory, 'captures'),
        '127.0.0.1',
        String(port),
      ],
      { env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let output = '',
      errors = '';
    child.stderr.on('data', (chunk) => {
      errors += chunk.toString();
    });
    const exited = new Promise<number | null>((done) =>
      child.once('close', done)
    );
    try {
      await new Promise<void>((done, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('START_TIMEOUT')),
          20000
        );
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('exit', () => {
          clearTimeout(timeout);
          reject(new Error('EARLY_EXIT'));
        });
        child.stdout.on('data', (chunk) => {
          output += chunk.toString();
          if (output.includes('CAPTURE_READY')) {
            clearTimeout(timeout);
            done();
          }
        });
      });
      expect(
        await (await fetch(`http://127.0.0.1:${port}/health`)).text()
      ).toBe('OK');
      const raw = JSON.stringify({
        object: 'page',
        entry: [
          {
            id: '999',
            changes: [
              {
                value: {
                  message: 'PRIVATE_COMMENT',
                  from: { id: 'PRIVATE_AUTHOR' },
                },
              },
            ],
          },
        ],
      });
      const response = await fetch(
        `http://127.0.0.1:${port}/public/fb-webhook-proof`,
        {
          method: 'POST',
          body: raw,
          headers: {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': `sha256=${createHmac('sha256', 'TEST_SECRET')
              .update(raw)
              .digest('hex')}`,
          },
        }
      );
      expect(await response.text()).toBe('IGNORED');
      child.kill('SIGTERM');
      expect(await exited).toBe(0);
      const lines = output.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('CAPTURE_READY');
      expect(JSON.parse(lines[1])).toEqual({
        event: 'META_PAGE_WEBHOOK',
        appId: '456',
        expectedPageId: '123',
        pageIds: ['999'],
        entryCount: 1,
        decision: 'IGNORED_OTHER_PAGE',
      });
      expect(output).not.toMatch(
        /PRIVATE_COMMENT|PRIVATE_AUTHOR|TEST_SECRET|sha256|verifyToken/
      );
      expect(errors).toBe('');
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }, 30000);
});
