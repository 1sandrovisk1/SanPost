import { BadRequestException, HttpException } from '@nestjs/common';
import { CommentKind } from '@prisma/client';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { postContentPlainText } from '@gitroom/helpers/utils/post.content.plain.text';
import {
  COMMENT_MAX_LENGTH,
  COMMENT_NAME_MAX_LENGTH,
} from '@gitroom/nestjs-libraries/dtos/comments/add.comment.dto';

// Comentarios no preview publico (upstream #2079), integrados ao modelo de
// revisao do fork: membro da org, convidado com link de revisao e visitante
// anonimo escrevem na mesma tabela `Comments`.

// Controle e direcao bidi (U+202A-E, U+2066-9): texto livre de convidado nao
// pode reordenar o rotulo exibido ao lado (ex.: "Equipe" falso). A regex vem
// de string para o arquivo nao carregar os caracteres crus.
const INVISIBLE_CHARS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u202A-\\u202E\\u2066-\\u2069]',
  'g'
);
const HTML_TAG = /<\/?[a-z!][^<>]*>/gi;

// Nome de convidado/anonimo: texto livre, sem HTML, uma linha.
export const sanitizeCommentName = (
  value: unknown,
  maxLength = COMMENT_NAME_MAX_LENGTH
) =>
  typeof value !== 'string'
    ? ''
    : value
        .replace(HTML_TAG, '')
        .replace(INVISIBLE_CHARS, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);

// Corpo de comentario de convidado/anonimo: sem HTML, quebras de linha
// mantidas. O frontend sempre renderiza como texto (nunca innerHTML).
export const sanitizeCommentContent = (value: unknown) =>
  typeof value !== 'string'
    ? ''
    : value
        .replace(HTML_TAG, '')
        .replace(INVISIBLE_CHARS, '')
        .trim()
        .slice(0, COMMENT_MAX_LENGTH);

export interface CommentPlacementInput {
  postId?: string;
  parentId?: string;
  anchorStart?: number;
  anchorEnd?: number;
  anchorQuote?: string;
}

export interface CommentPlacement {
  postId: string;
  parentId?: string;
  anchorStart?: number;
  anchorEnd?: number;
  anchorQuote?: string;
}

export const hasPlacement = (input: CommentPlacementInput | undefined) =>
  !!input &&
  (!!input.postId ||
    !!input.parentId ||
    typeof input.anchorStart === 'number' ||
    typeof input.anchorEnd === 'number' ||
    !!input.anchorQuote);

// Offsets no texto puro do HTML sanitizado do item; o trecho precisa bater
// com o texto atual (senao o destaque apontaria para outro lugar).
export const assertAnchorMatches = (
  content: string,
  anchorStart: number,
  anchorEnd: number,
  anchorQuote: string | undefined
) => {
  const plainText = postContentPlainText(content);
  if (
    anchorStart < 0 ||
    anchorStart >= anchorEnd ||
    anchorEnd > plainText.length
  ) {
    throw new BadRequestException('Anchor is out of range');
  }
  if (anchorQuote !== plainText.slice(anchorStart, anchorEnd)) {
    throw new BadRequestException('Anchor does not match the post text');
  }
};

// Trecho que deixou de bater depois de uma edicao: o comentario fica, sem
// destaque (a citacao continua no card).
export const isAnchorStale = (
  plainText: string,
  comment: {
    anchorStart: number | null;
    anchorEnd: number | null;
    anchorQuote: string | null;
  }
) =>
  comment.anchorStart === null ||
  comment.anchorEnd === null ||
  comment.anchorQuote !==
    plainText.slice(comment.anchorStart, comment.anchorEnd);

export type PreviewCommentAuthor = 'member' | 'guest' | 'anonymous';

export interface PreviewCommentRow {
  id: string;
  postId: string;
  parentId: string | null;
  kind: CommentKind;
  content: string;
  anchorStart: number | null;
  anchorEnd: number | null;
  anchorQuote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  userId: string | null;
  reviewLinkId: string | null;
  guestName: string | null;
  user?: { name: string | null; email: string | null } | null;
}

export const commentAuthor = (row: {
  userId: string | null;
  reviewLinkId: string | null;
}): PreviewCommentAuthor =>
  row.userId ? 'member' : row.reviewLinkId ? 'guest' : 'anonymous';

const baseComment = (row: PreviewCommentRow) => ({
  id: row.id,
  postId: row.postId,
  parentId: row.parentId,
  kind: row.kind,
  content: row.content,
  anchorStart: row.anchorStart,
  anchorEnd: row.anchorEnd,
  anchorQuote: row.anchorQuote,
  resolvedAt: row.resolvedAt,
  createdAt: row.createdAt,
  author: commentAuthor(row),
});

// GET publico: allowlist. Sem userId, e-mail, IP, user agent, org ou link; o
// membro da equipe vira "Usuario N" (indice por resposta, nao e id).
export const toPublicPreviewComments = (rows: PreviewCommentRow[]) => {
  const members = new Map<string, number>();
  return rows.map((row) => {
    if (row.userId && !members.has(row.userId)) {
      members.set(row.userId, members.size + 1);
    }
    return {
      ...baseComment(row),
      name: row.userId ? null : row.guestName,
      memberIndex: row.userId ? members.get(row.userId)! : null,
    };
  });
};

// GET autenticado (membro com acesso ao post): nome real da equipe.
export const toMemberPreviewComments = (rows: PreviewCommentRow[]) =>
  rows.map((row) => ({
    ...baseComment(row),
    name: row.userId
      ? row.user?.name || row.user?.email || null
      : row.guestName,
    memberIndex: null,
  }));

// O anonimo so existe com o reCAPTCHA configurado (site + secret): sem ele, a
// rota publica de escrita fica fechada.
export const isAnonymousPreviewCommentEnabled = () =>
  !!process.env.RECAPTCHA_SECRET_KEY &&
  !!process.env.RECAPTCHA_SITE_KEY &&
  !!process.env.FRONTEND_URL;

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

// Host fixo do Google (nao e URL de usuario). Falha fechada: rede, timeout ou
// resposta fora do contrato contam como captcha invalido.
export const verifyRecaptchaToken = async (token: unknown) => {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret || typeof token !== 'string' || !token || token.length > 4096) {
    return false;
  }
  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return false;
    }
    const body = (await response.json()) as {
      success?: unknown;
      hostname?: unknown;
    };
    return (
      body?.success === true &&
      body.hostname === new URL(process.env.FRONTEND_URL!).hostname
    );
  } catch {
    return false;
  }
};

// Contador em janela fixa no Redis. Sem Redis, a escrita publica falha fechada.
export const consumeRateLimit = async (
  key: string,
  max: number,
  windowSeconds: number
) => {
  try {
    const count = await ioRedis.incr(key);
    if (count === 1) {
      await ioRedis.expire(key, windowSeconds);
    }
    if (count > max) {
      throw new HttpException('Too many requests', 429);
    }
  } catch (err) {
    if (err instanceof HttpException) {
      throw err;
    }
    throw new HttpException('Rate limit unavailable', 503);
  }
};
