import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateAnonymousCommentDto,
  CreateReviewCommentDto,
  GuestReviewCommentDto,
  ResolveCommentDto,
} from './add.comment.dto';

const fields = async (type: new () => object, input: object) =>
  (await validate(plainToInstance(type, input))).map((error) => error.property);

const anonymous = {
  content: 'Corrigir o titulo',
  displayName: 'Cliente',
  recaptchaToken: 'one-time-token',
};

describe('DTO de comentarios no preview', () => {
  it('aceita comentario anonimo ancorado sem conceder tipo de aprovacao', async () => {
    expect(
      await fields(CreateAnonymousCommentDto, {
        ...anonymous,
        postId: 'post-child',
        anchorStart: 2,
        anchorEnd: 8,
        anchorQuote: 'titulo',
      })
    ).toEqual([]);
  });
  it.each(['content', 'displayName', 'recaptchaToken'] as const)(
    'exige %s no envio anonimo',
    async (field) => {
      expect(
        await fields(CreateAnonymousCommentDto, { ...anonymous, [field]: '' })
      ).toContain(field);
    }
  );
  it.each([
    ['content', 'x'.repeat(2001)],
    ['displayName', 'x'.repeat(81)],
    ['recaptchaToken', 'x'.repeat(4097)],
    ['postId', 'x'.repeat(65)],
    ['parentId', 'x'.repeat(65)],
    ['anchorStart', -1],
    ['anchorStart', 0.5],
    ['anchorEnd', '5'],
    ['anchorEnd', 100001],
    ['anchorQuote', 'x'.repeat(501)],
  ])('rejeita valor fora do contrato em %s', async (field, value) => {
    expect(
      await fields(CreateAnonymousCommentDto, { ...anonymous, [field]: value })
    ).toContain(field);
  });
  it('mantem tipos de revisao existentes e rejeita tipo desconhecido', async () => {
    for (const kind of ['COMMENT', 'APPROVAL', 'CHANGE_REQUEST']) {
      expect(
        await fields(CreateReviewCommentDto, { kind, comment: 'Nota' })
      ).toEqual([]);
    }
    expect(
      await fields(CreateReviewCommentDto, { kind: 'DELETE', comment: 'Nota' })
    ).toContain('kind');
  });
  it('limita texto de convidado mesmo quando o token e valido', async () => {
    expect(
      await fields(GuestReviewCommentDto, {
        token: 'a'.repeat(32),
        guestName: 'Cliente',
        guestEmail: 'a@example.com',
        content: 'x'.repeat(2001),
      })
    ).toContain('content');
  });
  it('resolucao exige booleano real e nao string ou numero', async () => {
    expect(await fields(ResolveCommentDto, { resolved: true })).toEqual([]);
    expect(await fields(ResolveCommentDto, { resolved: false })).toEqual([]);
    for (const resolved of ['true', 1, undefined]) {
      expect(await fields(ResolveCommentDto, { resolved })).toContain(
        'resolved'
      );
    }
  });
});
