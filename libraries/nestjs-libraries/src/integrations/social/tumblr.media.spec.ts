import 'reflect-metadata';
import type { AxiosInstance } from 'axios';
import { TumblrProvider } from './tumblr.provider';
import {
  mkdtempSync,
  writeFileSync,
  truncateSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

class TestTumblrProvider extends TumblrProvider {
  public override getSsrfSafeAxios(): AxiosInstance {
    return super.getSsrfSafeAxios();
  }
}

describe('midia do Tumblr antes da publicacao', () => {
  let root: string;
  let before: string | undefined;
  let p: TestTumblrProvider;
  let send: jest.Mock;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tumblr-proof-'));
    before = process.env.UPLOAD_DIRECTORY;
    process.env.UPLOAD_DIRECTORY = root;
    p = new TestTumblrProvider();
    send = jest
      .fn()
      .mockResolvedValue({ status: 201, data: { response: { id: '123' } } });
    jest
      .spyOn(p, 'getSsrfSafeAxios')
      .mockReturnValue({ post: send } as unknown as AxiosInstance);
  });
  afterEach(() => {
    if (before === undefined) delete process.env.UPLOAD_DIRECTORY;
    else process.env.UPLOAD_DIRECTORY = before;
    rmSync(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  const post = (paths: string[]) =>
    [
      {
        id: 'post',
        message: 'Imagem',
        settings: {},
        media: paths.map((path) => ({ path, alt: 'Descricao' })),
      },
    ] as any;
  it('envia multipart com imagem local e metadados NPF/alt', async () => {
    const path = join(root, 'image.png');
    writeFileSync(
      path,
      await sharp({
        create: { width: 2, height: 3, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer()
    );
    expect(
      (await p.post('owned', 'TOKEN', post([path]), {} as any))[0].postId
    ).toBe('123');
    const body = send.mock.calls[0][1].getBuffer().toString();
    expect(body).toContain('media-0');
    expect(body).toContain('"width":2');
    expect(body).toContain('"alt_text":"Descricao"');
    expect(send.mock.calls[0][2].maxRedirects).toBe(0);
  });
  it('recusa symlink e caminho fora da biblioteca antes de upload', async () => {
    const outside = join(tmpdir(), 'tumblr-outside-' + Date.now() + '.png');
    writeFileSync(outside, 'private');
    symlinkSync(outside, join(root, 'link.png'));
    try {
      for (const path of [outside, join(root, 'link.png')])
        await expect(
          p.post('owned', 'TOKEN', post([path]), {} as any)
        ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    } finally {
      rmSync(outside, { force: true });
    }
  });
  it('limita cada foto antes de ler corpo', async () => {
    const path = join(root, 'large.png');
    writeFileSync(path, '');
    truncateSync(path, 20 * 1024 * 1024 + 1);
    await expect(
      p.post('owned', 'TOKEN', post([path]), {} as any)
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('aplica teto agregado mesmo com fotos individualmente aceitas', async () => {
    const paths: string[] = [];
    const image = await sharp({
      create: { width: 1, height: 1, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    for (let i = 0; i < 6; i++) {
      const path = join(root, `image-${i}.png`);
      writeFileSync(path, image);
      truncateSync(path, 20 * 1024 * 1024);
      paths.push(path);
    }
    await expect(
      p.post('owned', 'TOKEN', post(paths), {} as any)
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  }, 15000);
  it('recusa destino privado em midia remota sem publicar', async () => {
    await expect(
      p.post(
        'owned',
        'TOKEN',
        post(['https://127.0.0.1/private.png']),
        {} as any
      )
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('upload incerto nao envia multipart de novo', async () => {
    const path = join(root, 'image.png');
    writeFileSync(
      path,
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer()
    );
    send.mockRejectedValue(new Error('lost response'));
    await expect(
      p.post('owned', 'TOKEN', post([path]), {} as any)
    ).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
