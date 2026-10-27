import { createMock } from '../../../test';
import { PrismaService } from '../prisma.service';
import { PostManagementRepository } from './post-management.repository';
describe('repositorio de posts gerenciados', () => {
  const db = createMock<PrismaService>();
  const scope = { organizationId: 'org', profileId: 'perfil' };
  const repo = new PostManagementRepository(db);
  it('tempo de espera da trava conta no prazo antes de qualquer mutacao ou RPC', async () => {
    let now = 0;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const transaction = jest.fn(async (operation) =>
      operation({
        $queryRaw: jest.fn(async () => {
          now += 30000;
          return [];
        }),
      })
    );
    Object.assign(db, { $transaction: transaction });
    await expect(
      repo.lock(scope, 'p', async (assertLease) => assertLease())
    ).rejects.toThrow('POST_OPERATION_LEASE_EXPIRED');
    clock.mockRestore();
  });
  it('lista apenas raizes do perfil com canal e paginacao limitados', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    Object.assign(db, { post: { findMany } });
    await repo.list(scope, { state: 'QUEUE', limit: 3 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ...scope,
          parentPostId: null,
          deletedAt: null,
          state: 'QUEUE',
          integration: { profileId: 'perfil' },
        }),
        take: 4,
      })
    );
  });
});
