import { createPrismaRepositoryMock } from '../../../test';
import { PrismaService } from '../prisma.service';
import { ScheduledPostsRepository } from './scheduled-posts.repository';
const scope = { organizationId: 'o', profileId: 'p' };
describe('repositorio de alvos agendados', () => {
  const db = {
    ...createPrismaRepositoryMock('integration').model,
    ...createPrismaRepositoryMock('post').model,
    ...createPrismaRepositoryMock('flow').model,
    ...createPrismaRepositoryMock('flowNode').model,
    ...createPrismaRepositoryMock('flowEdge').model,
    ...createPrismaRepositoryMock('deferredNextAutomationEvent').model,
    ...createPrismaRepositoryMock('scheduledAutomationTarget').model,
    scheduledAutomationEvent: {
      ...createPrismaRepositoryMock('scheduledAutomationEvent').model
        .scheduledAutomationEvent,
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };
  const repo = new ScheduledPostsRepository(db as unknown as PrismaService);
  beforeEach(() => jest.clearAllMocks());
  it('retorna miniatura e midia do agendamento sem expor os demais campos', async () => {
    db.integration.findFirst.mockResolvedValue({ id: 'i' } as any);
    db.post.findMany.mockResolvedValue([{ ...scope, id: 'post', integrationId: 'i', state: 'QUEUE', content: 'Video', settings: '{}', publishDate: new Date(0), image: JSON.stringify([{ path: '/uploads/video.mp4', thumbnail: '/uploads/cover.jpg' }]), token: 'secret' }] as any);
    const result = await repo.list(scope, 'i');
    expect(result.posts[0]).toMatchObject({ thumbnailUrl: '/uploads/cover.jpg', mediaUrl: '/uploads/video.mp4', mediaType: 'VIDEO' });
    expect(result.posts[0]).not.toHaveProperty('token');
  });
  it('edita canvas ativo sem perder o alvo publicado', async () => {
    (db.$transaction as jest.Mock).mockImplementation(async cb => cb(db));
    db.flow.findFirst.mockResolvedValue({ id: 'f', integrationId: 'i', status: 'ACTIVE' } as any);
    db.scheduledAutomationTarget.findUnique.mockResolvedValue({ postId: 'post' } as any);
    db.post.findFirst.mockResolvedValue({ ...scope, id: 'post', integrationId: 'i', state: 'PUBLISHED', releaseId: '123', settings: '{}' } as any);
    db.flowNode.create.mockResolvedValue({ id: 'created' } as any);
    await expect(repo.saveLegacyCanvas(scope, 'f', [{ id: 'n', type: 'TRIGGER', data: '{"mode":"scheduled","scheduledPostId":"post"}', positionX: 0, positionY: 0 }], [])).resolves.toBeDefined();
    expect(db.scheduledAutomationTarget.delete).not.toHaveBeenCalled();
  });
  it('consulta somente a fila raiz da conta e perfil sem retornar tokens', async () => {
    db.integration.findFirst.mockResolvedValue({ id: 'i' } as any);
    db.post.findMany.mockResolvedValue([]);
    await repo.list(scope, 'i');
    expect(db.integration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ...scope, id: 'i' }),
        select: { id: true },
      })
    );
    expect(db.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          integrationId: 'i',
          state: 'QUEUE',
          releaseId: null,
          parentPostId: null,
          deletedAt: null,
        }),
      })
    );
  });
  it('captura so eventos posteriores a ativacao e para o destino do perfil', async () => {
    const event = {
      ...scope,
      integrationId: 'i',
      platform: 'instagram' as const,
      remoteAccountId: '1',
      externalEventId: '2',
      externalPostId: '3',
      externalActorId: '4',
      text: 'quero',
      occurredAt: Date.now(),
    };
    db.scheduledAutomationTarget.findMany.mockResolvedValue([
      {
        id: 't',
        boundPostIds: [],
        flow: { updatedAt: new Date(event.occurredAt + 1000) },
        post: { ...scope, integrationId: 'i', state: 'QUEUE', settings: '{}' },
      },
    ] as any);
    await repo.capture(event);
    expect(db.scheduledAutomationEvent.createMany).not.toHaveBeenCalled();
    expect(db.scheduledAutomationTarget.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          integrationId: 'i',
          flow: expect.objectContaining({
            ...scope,
            status: 'ACTIVE',
            deletedAt: null,
          }),
        }),
      })
    );
  });
  it('nao apaga o canvas quando o post foi cancelado durante a edicao', async () => {
    (db.$transaction as jest.Mock).mockImplementation(async (cb) => cb(db));
    db.flow.findFirst.mockResolvedValue({
      id: 'f',
      integrationId: 'i',
      status: 'PAUSED',
    } as any);
    db.scheduledAutomationTarget.findUnique.mockResolvedValue(null);
    db.post.findFirst.mockResolvedValue({
      ...scope,
      id: 'post',
      integrationId: 'i',
      state: 'DRAFT',
      settings: '{}',
    } as any);
    await expect(
      repo.saveLegacyCanvas(
        scope,
        'f',
        [
          {
            id: 'n',
            type: 'TRIGGER',
            positionX: 0,
            positionY: 0,
            data: '{"mode":"scheduled","scheduledPostId":"post"}',
          },
        ],
        []
      )
    ).rejects.toThrow();
    expect(db.flowNode.deleteMany).not.toHaveBeenCalled();
    expect(db.flow.update).not.toHaveBeenCalled();
  });
  it('descarta alvo editado ou post de outro perfil antes do despacho', async () => {
    db.scheduledAutomationTarget.findUnique.mockResolvedValue({
      flowId: 'f',
      integrationId: 'i',
      boundPostIds: ['3'],
      flow: { ...scope, status: 'ACTIVE', revision: 2, updatedAt: new Date(0) },
      post: {
        ...scope,
        integrationId: 'i',
        state: 'PUBLISHED',
        settings: '{}',
      },
    } as any);
    expect(
      await repo.validGuard('f', {
        targetId: 't',
        revision: 1,
        updatedAt: new Date(0).toISOString(),
        externalPostId: '3',
      })
    ).toBe(false);
  });
  it('limpa dados apos a retencao em vez de apenas marcar expirado', async () => {
    await repo.cleanup();
    expect(db.scheduledAutomationEvent.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });
});
