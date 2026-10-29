import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_NAME_MAX_LENGTH = 80;
export const COMMENT_QUOTE_MAX_LENGTH = 500;
const MAX_ANCHOR_OFFSET = 100_000;

// Onde o comentario fica no preview (upstream #2079): resposta a um comentario
// raiz ou um trecho do texto de um item da thread. Igual para membro,
// convidado do link de revisao e anonimo; o service valida contra o post.
export class CommentPlacementDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  postId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_ANCHOR_OFFSET)
  anchorStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_ANCHOR_OFFSET)
  anchorEnd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(COMMENT_QUOTE_MAX_LENGTH)
  anchorQuote?: string;
}

// Membro da org: comentar, aprovar ou pedir alteracao (`POST /posts/:id/comments`).
export class CreateReviewCommentDto extends CommentPlacementDto {
  @IsOptional()
  @IsString()
  @MaxLength(COMMENT_MAX_LENGTH)
  comment?: string;

  @IsOptional()
  @IsIn(['COMMENT', 'APPROVAL', 'CHANGE_REQUEST'])
  kind?: 'COMMENT' | 'APPROVAL' | 'CHANGE_REQUEST';
}

// Convidado com link de revisao (`POST /public/posts/:id/review/comment`).
export class GuestReviewCommentDto extends CommentPlacementDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(COMMENT_NAME_MAX_LENGTH)
  guestName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(254)
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(COMMENT_MAX_LENGTH)
  content?: string;
}

// Visitante anonimo do preview (`POST /public/posts/:id/comments`), so com o
// reCAPTCHA configurado.
export class CreateAnonymousCommentDto extends CommentPlacementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(COMMENT_MAX_LENGTH)
  content: string;

  @IsString()
  @MinLength(1)
  @MaxLength(COMMENT_NAME_MAX_LENGTH)
  displayName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  recaptchaToken: string;
}

export class ResolveCommentDto {
  @IsBoolean()
  resolved: boolean;
}
