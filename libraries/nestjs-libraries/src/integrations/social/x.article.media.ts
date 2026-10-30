import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import sharp from 'sharp';
import { normalizeOwnMediaUrl } from '@gitroom/helpers/utils/inline.images';
import {
  resolveSafeUploadFile,
  extractUploadPathSegments,
} from '../../upload/safe.upload.path';
import { fetchPublicUrl } from '../../upload/public-url.fetch';
import { BadBody } from '../social.abstract';

// One image at a time; no arbitrary URLs or files outside the upload library.
export async function xArticleImage(path: string): Promise<Buffer> {
  const cap = 20 * 1024 * 1024;
  try {
    let buffer: Buffer;
    let local: string | undefined;
    const base = process.env.UPLOAD_DIRECTORY || '';
    if (/^https?:\/\//i.test(path)) {
      const own = normalizeOwnMediaUrl(path);
      if (!own) throw new Error();
      const front =
        process.env.FRONTEND_URL && new URL(process.env.FRONTEND_URL);
      const url = new URL(own);
      if (
        front &&
        url.origin === front.origin &&
        url.pathname.startsWith('/uploads/')
      ) {
        if (!base) throw new Error();
        local = resolveSafeUploadFile(base, extractUploadPathSegments(own));
      } else {
        buffer = (await fetchPublicUrl(own, { maxBytes: cap })).buffer;
      }
    } else {
      if (!base) throw new Error();
      local = resolveSafeUploadFile(
        base,
        relative(resolve(base), resolve(path)).split(sep)
      );
    }
    if (local) {
      if ((await stat(local)).size > cap) throw new Error();
      buffer = await readFile(local);
    }
    if (!buffer!?.length || buffer!.length > cap) throw new Error();
    const output = await sharp(buffer!, { limitInputPixels: 40000000 })
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg()
      .toBuffer();
    if (output.length > 5 * 1024 * 1024) throw new Error();
    return output;
  } catch {
    throw new BadBody(
      'x',
      '{}',
      '{}',
      'Não foi possível preparar a imagem do artigo. Use uma imagem da biblioteca de até 20 MB.'
    );
  }
}
