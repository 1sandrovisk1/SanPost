import { xArticleImage } from './x.article.media';
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
describe('imagens de X Articles', () => {
  let root: string;
  let previous: string | undefined;
  let previousFront: string | undefined;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'x-article-'));
    previous = process.env.UPLOAD_DIRECTORY;
    previousFront = process.env.FRONTEND_URL;
    process.env.UPLOAD_DIRECTORY = root;
    process.env.FRONTEND_URL = 'https://app.test';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.UPLOAD_DIRECTORY;
    else process.env.UPLOAD_DIRECTORY = previous;
    if (previousFront === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFront;
    rmSync(root, { recursive: true, force: true });
  });
  it('converte imagem propria para JPEG inclusive capa', async () => {
    writeFileSync(
      join(root, 'image.png'),
      await sharp({
        create: { width: 2, height: 3, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer()
    );
    const result = await xArticleImage('https://app.test/uploads/image.png');
    expect((await sharp(result).metadata()).format).toBe('jpeg');
  });
  it('recusa arquivo de fora e symlink externo', async () => {
    const outside = join(tmpdir(), 'private-' + Date.now() + '.png');
    writeFileSync(outside, 'PRIVATE');
    symlinkSync(outside, join(root, 'link.png'));
    try {
      for (const path of [outside, join(root, 'link.png')])
        await expect(xArticleImage(path)).rejects.toThrow(/biblioteca/);
    } finally {
      rmSync(outside, { force: true });
    }
  });
  it('recusa download externo mesmo se extensao for imagem', async () => {
    await expect(
      xArticleImage('https://127.0.0.1/private.png')
    ).rejects.toThrow(/biblioteca/);
  });
  it('sem diretorio configurado nao le imagem do cwd via URL propria', async () => {
    const name = 'x-fixture-' + Date.now() + '.png';
    const path = join(process.cwd(), name);
    writeFileSync(
      path,
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer()
    );
    delete process.env.UPLOAD_DIRECTORY;
    try {
      await expect(
        xArticleImage('https://app.test/uploads/' + name)
      ).rejects.toThrow(/biblioteca/);
    } finally {
      rmSync(path, { force: true });
    }
  });
  it('limita bytes antes da leitura local', async () => {
    const path = join(root, 'big.png');
    writeFileSync(path, '');
    truncateSync(path, 20 * 1024 * 1024 + 1);
    await expect(xArticleImage(path)).rejects.toThrow(/20 MB/);
  });
});
