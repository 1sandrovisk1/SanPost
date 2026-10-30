import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { PostWorkflowMigrationRepository } from './post-workflow-migration.repository';

describe('PostWorkflowMigrationRepository', () => {
  it('seleciona apenas raizes futuras sem publicacao e pagina sem tokens', async () => {
    const prisma = createPrismaRepositoryMock('post');
    const repo = new PostWorkflowMigrationRepository(prisma as any);
    await repo.listCandidates('cursor');
    expect(prisma.model.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: 'QUEUE',
          parentPostId: null,
          deletedAt: null,
          AND: [
            { OR: [{ releaseId: null }, { releaseId: '' }] },
            { OR: [{ releaseURL: null }, { releaseURL: '' }] },
          ],
          publishDate: { gt: expect.any(Date) },
        }),
        select: { id: true },
        take: 50,
        cursor: { id: 'cursor' },
        skip: 1,
        orderBy: { id: 'asc' },
      })
    );
  });
  it('revalida canal ativo e retorna somente metadados', async () => {
    const prisma = createPrismaRepositoryMock('post');
    const repo = new PostWorkflowMigrationRepository(prisma as any);
    await repo.findCandidate('p');
    expect(prisma.model.post.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'p',
          integration: expect.objectContaining({
            deletedAt: null,
            disabled: false,
            refreshNeeded: false,
            inBetweenSteps: false,
          }),
        }),
        select: {
          id: true,
          organizationId: true,
          integrationId: true,
          publishDate: true,
          updatedAt: true,
          integration: { select: { providerIdentifier: true } },
        },
      })
    );
  });
});
