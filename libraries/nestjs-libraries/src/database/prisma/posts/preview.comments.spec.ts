jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { incr: jest.fn(), expire: jest.fn() },
}));
import { CommentKind } from '@prisma/client';
import type { PreviewCommentRow } from './preview.comments';
import {
  toPublicPreviewComments,
  toMemberPreviewComments,
  sanitizeCommentContent,
  sanitizeCommentName,
  isAnchorStale,
  consumeRateLimit,
} from './preview.comments';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

const row: PreviewCommentRow & {
  guestEmail: string;
  guestIp: string;
  guestUserAgent: string;
  organizationId: string;
} = {
  id: 'comment',
  postId: 'root',
  parentId: null,
  kind: CommentKind.COMMENT,
  content: 'Nota',
  anchorStart: 0,
  anchorEnd: 4,
  anchorQuote: 'Post',
  resolvedAt: null,
  createdAt: new Date('2026-10-29T12:00:00Z'),
  userId: 'private-user',
  reviewLinkId: null,
  guestName: null,
  user: { name: 'Equipe', email: 'private@example.com' },
  guestEmail: 'guest@example.com',
  guestIp: '127.0.0.1',
  guestUserAgent: 'private-agent',
  organizationId: 'private-org',
};

describe('projecao e limites do preview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('equipe recebe indice repetivel na resposta sem identificadores privados', () => {
    const comments = toPublicPreviewComments([
      row,
      { ...row, id: 'reply', userId: 'another-user' },
      { ...row, id: 'again' },
    ]);
    expect(comments.map((comment) => comment.memberIndex)).toEqual([1, 2, 1]);
    expect(comments[0]).toMatchObject({
      author: 'member',
      name: null,
      anchorQuote: 'Post',
    });
    expect(JSON.stringify(comments)).not.toMatch(
      /private-user|another-user|private@example.com|guest@example.com|127.0.0.1|private-agent|private-org|userId|reviewLinkId/
    );
  });
  it('convidado verificado e anonimo permanecem distintos sem expor link ou email', () => {
    const comments = toPublicPreviewComments([
      {
        ...row,
        userId: null,
        reviewLinkId: 'private-review-link',
        guestName: 'Cliente',
      },
      { ...row, userId: null, reviewLinkId: null, guestName: 'Visitante' },
    ]);
    expect(
      comments.map(({ author, name, memberIndex }) => ({
        author,
        name,
        memberIndex,
      }))
    ).toEqual([
      { author: 'guest', name: 'Cliente', memberIndex: null },
      { author: 'anonymous', name: 'Visitante', memberIndex: null },
    ]);
    expect(JSON.stringify(comments)).not.toContain('private-review-link');
  });
  it('membro autenticado ve nome da equipe sem receber o objeto de usuario', () => {
    expect(toMemberPreviewComments([row])[0]).toMatchObject({
      author: 'member',
      name: 'Equipe',
      memberIndex: null,
    });
    expect(toMemberPreviewComments([row])[0]).not.toHaveProperty('user');
  });
  it('remove HTML e controles bidi do nome e preserva quebras do corpo como texto', () => {
    expect(sanitizeCommentName('<b>Cliente</b>\u202E  A\nB')).toBe(
      'Cliente A B'
    );
    expect(sanitizeCommentContent('<b>Primeira</b>\nSegunda\u2066')).toBe(
      'Primeira\nSegunda'
    );
  });
  it('edicao do trecho invalida destaque sem apagar a citacao', () => {
    expect(isAnchorStale('Post atual', row)).toBe(false);
    expect(isAnchorStale('Novo texto', row)).toBe(true);
    expect(row.anchorQuote).toBe('Post');
  });
  it('janela inicia no primeiro uso e nao e prolongada no segundo', async () => {
    (ioRedis.incr as jest.Mock)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    await consumeRateLimit('budget', 2, 300);
    await consumeRateLimit('budget', 2, 300);
    expect(ioRedis.expire).toHaveBeenCalledTimes(1);
    expect(ioRedis.expire).toHaveBeenCalledWith('budget', 300);
    (ioRedis.incr as jest.Mock).mockResolvedValueOnce(3);
    await expect(consumeRateLimit('budget', 2, 300)).rejects.toMatchObject({
      status: 429,
    });
  });
  it('falha de expiracao nao libera escrita publica sem limite', async () => {
    (ioRedis.incr as jest.Mock).mockResolvedValueOnce(1);
    (ioRedis.expire as jest.Mock).mockRejectedValueOnce(
      new Error('Redis offline')
    );
    await expect(consumeRateLimit('budget', 2, 300)).rejects.toMatchObject({
      status: 503,
    });
  });
});
