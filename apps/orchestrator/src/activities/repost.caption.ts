import { RepostDestinationFormat } from '@prisma/client';
import { truncateTikTokCaption } from '@gitroom/nestjs-libraries/integrations/social/tiktok.caption';

/**
 * Trunca caption por limite de cada destino. Caption "padrao" (com mais de
 * 250/500 chars) precisa ser cortada antes de mandar pra X/Threads/Pinterest;
 * outros destinos toleram texto longo sem problema.
 *
 * X_POST usa 250 (e nao o limite oficial de 280) porque o contador "weighted"
 * do X conta caracteres especiais (— … emojis) como 2, e captions vindas do
 * Instagram costumam ter pontuacao especial que estoura 280 mesmo com o
 * .slice ingenuo.
 */
export function captionForFormat(
  format: RepostDestinationFormat,
  caption: string
): string {
  if (!caption) return caption;
  switch (format) {
    case 'X_POST':
      return caption.slice(0, 250);
    case 'THREADS_POST':
      return caption.slice(0, 500);
    case 'PINTEREST_PIN':
      return caption.slice(0, 500);
    case 'TIKTOK_FEED':
      // legenda do Instagram (ate 2.200 caracteres, emoji conta 1) pode passar
      // dos 2.200 em UTF-16 que o TikTok aceita: corta sem partir emoji
      return truncateTikTokCaption(caption);
    default:
      return caption;
  }
}
