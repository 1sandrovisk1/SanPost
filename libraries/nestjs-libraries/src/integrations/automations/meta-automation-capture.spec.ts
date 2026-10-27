import { createHmac } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  readdir,
  stat,
  rm,
  chmod,
  writeFile,
  symlink,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddressInfo } from 'node:net';
import { request, Server } from 'node:http';
import { Writable } from 'node:stream';
import {
  CaptureConfig,
  FileCaptureStore,
  createCaptureServer,
  loadCaptureConfig,
  createCaptureDiagnosticWriter,
} from './meta-automation-capture';

describe('Receptor isolado da prova Facebook', () => {
  let directory: string;
  let server: Server;
  let base: string;
  let store: FileCaptureStore;
  let observe: jest.Mock;
  const config: CaptureConfig = {
    pageId: '123',
    appId: '456',
    integrationId: 'integration-test',
    organizationId: 'org-test',
    profileId: 'profile-test',
    appSecret: 'APP_SECRET_FOR_TEST_ONLY',
    verifyToken: 'a'.repeat(64),
  };
  const event = (pageId = '123') => ({
    object: 'page',
    entry: [
      {
        id: pageId,
        changes: [
          {
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              post_id: `${pageId}_10`,
              parent_id: `${pageId}_10`,
              comment_id: '10_20',
              from: { id: '90' },
              created_time: 1792612800,
              message: 'PRIVATE_COMMENT_TEXT',
            },
          },
        ],
      },
    ],
  });
  const sign = (raw: string) =>
    `sha256=${createHmac('sha256', config.appSecret)
      .update(raw)
      .digest('hex')}`;
  async function post(raw: string, signature = sign(raw), headers = {}) {
    return fetch(`${base}/public/fb-webhook-proof`, {
      method: 'POST',
      body: raw,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature,
        ...headers,
      },
    });
  }
  beforeEach(async () => {
    directory = await mkdtemp(join(await realpath(tmpdir()), 'fb-capture-'));
    store = await FileCaptureStore.open(join(directory, 'captures'), 2);
    observe = jest.fn();
    server = createCaptureServer(config, store, observe);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  it('devolve challenge somente com modo e token corretos, sem dados de perfil', async () => {
    const url = `${base}/public/fb-webhook-proof?hub.mode=subscribe&hub.verify_token=${config.verifyToken}&hub.challenge=12345`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('12345');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await fetch(url.replace(config.verifyToken, 'wrong'))).status).toBe(
      403
    );
    expect((await fetch(url + '&hub.verify_token=wrong')).status).toBe(403);
    expect((await fetch(url.replace('subscribe', 'other'))).status).toBe(403);
    expect(await readdir(join(directory, 'captures'))).toEqual([]);
    expect(observe).not.toHaveBeenCalled();
  });
  it('recusa HMAC antes de interpretar JSON e nao grava nada', async () => {
    expect(
      (await post('PRIVATE_NOT_JSON', `sha256=${'0'.repeat(64)}`)).status
    ).toBe(401);
    expect((await post(JSON.stringify(event()), '')).status).toBe(401);
    expect((await post('{bad-json')).status).toBe(400);
    expect(await readdir(join(directory, 'captures'))).toEqual([]);
    expect(observe).not.toHaveBeenCalled();
  });
  it.each(['foreign', 'mixed', 'instagram'])(
    'descarta lote %s sem gravar dados de outro perfil',
    async (kind) => {
      const body = event(kind === 'foreign' ? '999' : '123');
      if (kind === 'mixed') body.entry.push(...event('999').entry);
      if (kind === 'instagram') body.object = 'instagram';
      const response = await post(JSON.stringify(body));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('IGNORED');
      expect(await readdir(join(directory, 'captures'))).toEqual([]);
      if (kind === 'instagram') expect(observe).not.toHaveBeenCalled();
      else {
        expect(observe).toHaveBeenCalledWith({
          appId: '456',
          expectedPageId: '123',
          pageIds: kind === 'mixed' ? ['123', '999'] : ['999'],
          entryCount: body.entry.length,
          decision:
            kind === 'mixed' ? 'IGNORED_MIXED_PAGES' : 'IGNORED_OTHER_PAGE',
        });
        expect(JSON.stringify(observe.mock.calls)).not.toMatch(
          /PRIVATE_COMMENT|APP_SECRET|"90"|sha256|verifyToken/
        );
      }
    }
  );
  it('preserva bytes e assinatura com arquivos privados e contexto do servidor', async () => {
    const body = { ...event(), profileId: 'attacker-profile' };
    const raw = JSON.stringify(body, null, 2);
    const response = await post(raw);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('CAPTURED');
    expect(observe).toHaveBeenCalledWith({
      appId: '456',
      expectedPageId: '123',
      pageIds: ['123'],
      entryCount: 1,
      decision: 'CAPTURED',
    });
    const names = await readdir(join(directory, 'captures'));
    expect(names).toHaveLength(1);
    const folder = join(directory, 'captures', names[0]);
    expect((await stat(folder)).mode & 0o777).toBe(0o700);
    expect(await readFile(join(folder, 'webhook.json'), 'utf8')).toBe(raw);
    expect(await readFile(join(folder, 'signature.txt'), 'utf8')).toBe(
      sign(raw)
    );
    const metadata = JSON.parse(
      await readFile(join(folder, 'metadata.json'), 'utf8')
    );
    expect(metadata).toMatchObject({
      profileId: config.profileId,
      pageId: '123',
      acceptedComments: 1,
    });
    for (const name of ['webhook.json', 'signature.txt', 'metadata.json'])
      expect((await stat(join(folder, name))).mode & 0o777).toBe(0o600);
    expect(JSON.stringify(metadata)).not.toMatch(
      /APP_SECRET|PRIVATE_COMMENT_TEXT|attacker/
    );
  });
  it('captura diagnostico assinado da Pagina sem changes sem exigir parser de comentarios', async () => {
    expect(
      (
        await post(
          JSON.stringify({
            object: 'page',
            entry: [{ id: '123', messaging: [] }],
          })
        )
      ).status
    ).toBe(200);
    expect(await readdir(join(directory, 'captures'))).toHaveLength(1);
  });
  it('deduplica em concorrencia e depois de reiniciar, sem confirmar captura parcial', async () => {
    const raw = JSON.stringify(event());
    const responses = await Promise.all([post(raw), post(raw)]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(observe.mock.calls.map(([value]) => value.decision).sort()).toEqual([
      'CAPTURED',
      'DUPLICATE',
    ]);
    const names = await readdir(join(directory, 'captures'));
    expect(names).toHaveLength(1);
    const reopened = await FileCaptureStore.open(
      join(directory, 'captures'),
      2
    );
    expect(await reopened.save(config, Buffer.from(raw), sign(raw), 1)).toBe(
      'DUPLICATE'
    );
    await writeFile(
      join(directory, 'captures', names[0], 'signature.txt'),
      'corrupted'
    );
    expect((await post(raw)).status).toBe(503);
  });
  it('limita quota de capturas inclusive concorrentes e preserva anteriores', async () => {
    const bodies = [1, 2, 3].map((n) =>
      JSON.stringify({ ...event(), fixture: n })
    );
    const responses = await Promise.all(bodies.map((raw) => post(raw)));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 200, 503]);
    expect(await readdir(join(directory, 'captures'))).toHaveLength(2);
  });
  it('recusa corpo maior que 1 MiB, encoding comprimido e metodo nao suportado', async () => {
    expect((await post('x'.repeat(1024 * 1024 + 1))).status).toBe(413);
    expect(
      (await post('{}', sign('{}'), { 'content-encoding': 'gzip' })).status
    ).toBe(415);
    expect(
      (await fetch(`${base}/public/fb-webhook-proof`, { method: 'PUT' })).status
    ).toBe(405);
  });
  it('responde erro sanitizado quando armazenamento falha', async () => {
    jest
      .spyOn(store, 'save')
      .mockRejectedValueOnce(new Error('SECRET_PATH_AND_TEXT'));
    const response = await post(JSON.stringify(event()));
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('CAPTURE_UNAVAILABLE');
    expect(observe).not.toHaveBeenCalled();
  });

  it.each(['PRIVATE_ID\nINJECTION', '1'.repeat(33), 123, null])(
    'nao registra ID malformado %s',
    async (id) => {
      const response = await post(
        JSON.stringify({ object: 'page', entry: [{ id }] })
      );
      expect(response.status).toBe(400);
      expect(observe).not.toHaveBeenCalled();
      expect(await readdir(join(directory, 'captures'))).toEqual([]);
    }
  );

  it('limita a projecao e deduplica IDs sem misturar contexto de perfil do payload', async () => {
    const response = await post(
      JSON.stringify({
        object: 'page',
        profileId: 'UNTRUSTED_PROFILE',
        entry: [...event('999').entry, ...event('999').entry],
      })
    );
    expect(response.status).toBe(200);
    expect(observe).toHaveBeenCalledWith({
      appId: '456',
      expectedPageId: '123',
      pageIds: ['999'],
      entryCount: 2,
      decision: 'IGNORED_OTHER_PAGE',
    });
    expect(JSON.stringify(observe.mock.calls)).not.toContain(
      'UNTRUSTED_PROFILE'
    );
  });

  it('falhas sincronas e assincronas do observador nao alteram captura ou resposta', async () => {
    observe.mockImplementationOnce(() => {
      throw new Error('PRIVATE_ERROR');
    });
    expect(await (await post(JSON.stringify(event()))).text()).toBe('CAPTURED');
    observe.mockImplementationOnce(() =>
      Promise.reject(new Error('PRIVATE_ERROR'))
    );
    expect(await (await post(JSON.stringify(event()))).text()).toBe(
      'DUPLICATE'
    );
    await new Promise<void>((done) => setImmediate(done));
    expect(await readdir(join(directory, 'captures'))).toHaveLength(1);
  });

  it('diagnostico nao derruba processo por erro assincrono do stream e limita buffer', async () => {
    const observation = {
      appId: '456',
      expectedPageId: '123',
      pageIds: ['999'],
      entryCount: 1,
      decision: 'IGNORED_OTHER_PAGE' as const,
    };
    const broken = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('PRIVATE_STREAM_ERROR'));
      },
    });
    const diagnostic = createCaptureDiagnosticWriter(broken);
    diagnostic(observation);
    await new Promise<void>((done) => setImmediate(done));
    expect(() => diagnostic(observation)).not.toThrow();
    const blocked = new Writable({
      write() {
        /* Simula consumidor parado. */
      },
    });
    const bounded = createCaptureDiagnosticWriter(blocked);
    for (let i = 0; i < 10000; i++) bounded(observation);
    expect(blocked.writableLength).toBeLessThan(70000);
    blocked.destroy();
  });

  it('limita corpo chunked sem depender de Content-Length', async () => {
    const status = await new Promise<number | undefined>(
      (resolveStatus, reject) => {
        const outgoing = request(
          `${base}/public/fb-webhook-proof`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-hub-signature-256': sign('{}'),
            },
          },
          (response) => {
            response.resume();
            resolveStatus(response.statusCode);
          }
        );
        outgoing.on('error', reject);
        for (let i = 0; i < 17; i++) outgoing.write(Buffer.alloc(65536, 32));
        outgoing.end();
      }
    );
    expect(status).toBe(413);
    expect(await readdir(join(directory, 'captures'))).toEqual([]);
  });
  it('nao oferece download de capturas nem dados no healthcheck', async () => {
    const response = await fetch(`${base}/health`);
    expect(await response.text()).toBe('OK');
    expect((await fetch(`${base}/captures`)).status).toBe(404);
    expect((await fetch(`${base}/public/fb-webhook-proof/`)).status).toBe(404);
  });
  it('recusa configuracao publica, symlink, token curto ou contexto incompleto', async () => {
    const path = join(directory, 'config.json');
    await writeFile(path, JSON.stringify(config), { mode: 0o600 });
    expect(await loadCaptureConfig(path)).toEqual(config);
    await chmod(path, 0o644);
    await expect(loadCaptureConfig(path)).rejects.toThrow(
      'PRIVATE_FILE_REQUIRED'
    );
    await chmod(path, 0o600);
    const link = join(directory, 'linked.json');
    await symlink(path, link);
    await expect(loadCaptureConfig(link)).rejects.toThrow();
    await writeFile(path, JSON.stringify({ ...config, profileId: '' }));
    await expect(loadCaptureConfig(path)).rejects.toThrow(
      'INVALID_CAPTURE_CONFIG'
    );
    await writeFile(path, JSON.stringify({ ...config, verifyToken: 'short' }));
    await expect(loadCaptureConfig(path)).rejects.toThrow(
      'INVALID_CAPTURE_CONFIG'
    );
    await writeFile(
      path,
      JSON.stringify({ ...config, pageAccessToken: 'UNWANTED_SECRET' })
    );
    await expect(loadCaptureConfig(path)).rejects.toThrow(
      'INVALID_CAPTURE_CONFIG'
    );
  });
  it('recusa diretorio de capturas compartilhado ou symlink', async () => {
    await chmod(join(directory, 'captures'), 0o755);
    await expect(
      FileCaptureStore.open(join(directory, 'captures'))
    ).rejects.toThrow('PRIVATE_DIRECTORY_REQUIRED');
    const link = join(directory, 'linked');
    await symlink(join(directory, 'captures'), link);
    await expect(FileCaptureStore.open(link)).rejects.toThrow();
  });
});
