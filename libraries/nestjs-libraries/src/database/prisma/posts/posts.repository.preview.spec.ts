import { createPrismaRepositoryMock } from '../../../test';
import { PostsRepository } from './posts.repository';

const build = () => {
  const comments = createPrismaRepositoryMock('comments');
  const repository = new PostsRepository(
    {} as any,
    {} as any,
    comments as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { repository, comments: comments.model.comments };
};

describe('PostsRepository - escopo e privacidade dos comentarios', () => {
  it('consulta publica restringe a thread viva sem carregar identidade privada da equipe', async () => {
    const { repository, comments } = build();
    await repository.getComments(['root', 'child']);
    const query = (comments.findMany as jest.Mock).mock.calls[0][0];
    expect(query.where).toEqual({
      postId: { in: ['root', 'child'] },
      deletedAt: null,
    });
    expect(query.select).not.toHaveProperty('user');
    for (const field of [
      'guestEmail',
      'guestIp',
      'guestUserAgent',
      'organizationId',
    ]) {
      expect(query.select).not.toHaveProperty(field);
    }
  });
  it('consulta de membro inclui a org e somente os campos de identidade necessarios', async () => {
    const { repository, comments } = build();
    await repository.getComments(['root', 'child'], 'org');
    expect(comments.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          postId: { in: ['root', 'child'] },
          organizationId: 'org',
          deletedAt: null,
        },
        select: expect.objectContaining({
          user: { select: { email: true, name: true } },
        }),
      })
    );
  });
  it('moderacao carrega apenas comentario vivo da org e perfil do post', async () => {
    const { repository, comments } = build();
    await repository.getCommentScope('comment', 'org');
    expect(comments.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'comment', organizationId: 'org', deletedAt: null },
        select: expect.objectContaining({
          postId: true,
          post: { select: { profileId: true, deletedAt: true } },
        }),
      })
    );
  });
  it('resolver atualiza somente raiz viva da org', async () => {
    const { repository, comments } = build();
    const resolvedAt = new Date('2026-10-29T12:00:00Z');
    await repository.setCommentResolved('comment', 'org', resolvedAt);
    expect(comments.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'comment',
        organizationId: 'org',
        parentId: null,
        deletedAt: null,
      },
      data: { resolvedAt },
    });
  });
  it('exclusao logica inclui respostas sem alcancar outra org', async () => {
    const { repository, comments } = build();
    await repository.softDeleteComment('comment', 'org');
    expect(comments.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        deletedAt: null,
        OR: [{ id: 'comment' }, { parentId: 'comment' }],
      },
      data: { deletedAt: expect.any(Date) },
    });
  });
  it('retorno da criacao nao devolve IP ou identidade mesmo quando gravados', async () => {
    const { repository, comments } = build();
    await repository.createComment('org', null, 'child', 'Nota', 'COMMENT', {
      parentId: 'parent',
      guestName: 'Cliente',
      guestIp: '127.0.0.1',
      guestUserAgent: 'review-browser',
    });
    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org',
          userId: null,
          postId: 'child',
          parentId: 'parent',
          guestName: 'Cliente',
        }),
        select: { id: true, kind: true, createdAt: true },
      })
    );
  });
});
