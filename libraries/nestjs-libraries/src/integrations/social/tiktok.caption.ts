import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';

// Limites da Content Posting API do TikTok, contados em unidades UTF-16 (como
// `String.length`; emoji pesa 2): legenda de video (`post_info.title`) 2.200,
// descricao de foto 4.000, titulo de foto 90. Valem para o nativo, para o
// TikTok via Zernio e para o TikTok for Business (legenda de video 2.200, de
// foto 4.000). O compositor ainda corta antes, em 2.000 (upstream).
export const TIKTOK_VIDEO_CAPTION_LIMIT = 2200;
export const TIKTOK_PHOTO_DESCRIPTION_LIMIT = 4000;
export const TIKTOK_PHOTO_TITLE_LIMIT = 90;
export const TIKTOK_IDENTIFIERS = ['tiktok', 'zernio-tiktok', 'tiktok-business'];

export const tiktokTextLimit = (isPhoto: boolean) =>
  isPhoto ? TIKTOK_PHOTO_DESCRIPTION_LIMIT : TIKTOK_VIDEO_CAPTION_LIMIT;

// Mesma deteccao do provider: post de foto quando a primeira midia nao e mp4.
export const isTikTokPhotoPost = (media?: Array<{ path?: string }> | null) =>
  !(media?.[0]?.path || '').includes('mp4');

// Texto como o worker entrega ao provider (mesma conversao de post.activity).
export const tiktokPlainText = (content: string) =>
  stripHtmlValidation(
    'normal',
    content || '',
    true,
    false,
    !/<\/?[a-z][\s\S]*>/i.test(content || '')
  );

/** Mensagem de erro quando `text` passa do limite do TikTok; senao `null`. */
export const tiktokCaptionTooLong = (
  text: string,
  isPhoto: boolean
): string | null => {
  const limit = tiktokTextLimit(isPhoto);
  const length = (text || '').length;
  if (length <= limit) {
    return null;
  }
  const format = (n: number) => n.toLocaleString('pt-BR');
  return `O texto passa do limite do TikTok: ${format(length)} de ${format(
    limit
  )} caracteres${
    isPhoto ? ' na descrição da foto' : ' na legenda do vídeo'
  }. Encurte o texto e publique de novo.`;
};

/** Corta em 2.200 unidades UTF-16 sem partir um emoji (par substituto). */
export const truncateTikTokCaption = (text: string) => {
  if (!text || text.length <= TIKTOK_VIDEO_CAPTION_LIMIT) {
    return text;
  }
  let cut = text.slice(0, TIKTOK_VIDEO_CAPTION_LIMIT);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) {
    cut = cut.slice(0, -1);
  }
  return cut;
};
