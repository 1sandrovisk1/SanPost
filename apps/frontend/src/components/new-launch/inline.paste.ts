import { imageSources } from '@gitroom/helpers/utils/inline.images';

// Regras puras do colar/soltar com imagem inline (upstream 2aae02fe), fora do
// editor.tsx para o vitest do composer.

// a copied picture also comes as html linking to the site it was copied
// from, so the file wins unless the html has text of its own
export const pasteUploadsInline = (
  fileCount: number,
  html: string,
  sliceText = ''
) => fileCount > 0 && (!html || !sliceText.trim());

// inline images go into the content, which only holds pictures
export const onlyImages = <T extends { type: string }>(files: T[]) => {
  const images = files.filter((file) => file.type.startsWith('image/'));
  return { images, rejected: files.length - images.length };
};

// imagens do HTML colado que o editor vai descartar (fork: so midia da
// instancia entra no conteudo)
export const countForeignImages = (
  html: string,
  isOwnMedia: (src: unknown) => boolean
) => imageSources(html).filter((src) => !isOwnMedia(src)).length;
