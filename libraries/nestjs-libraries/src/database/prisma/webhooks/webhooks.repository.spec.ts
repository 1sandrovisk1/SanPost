import { createPrismaRepositoryMock } from '../../../test';
import type { Prisma } from '@prisma/client';
import { WebhooksRepository } from './webhooks.repository';

describe('WebhooksRepository - exclusao de organizacao', () => {
  it('leitura do worker nao resolve webhook de organizacao excluida', async () => {
    const hooks = createPrismaRepositoryMock('webhooks');
    const repo = new WebhooksRepository(hooks as any);
    await repo.getWebhooks('org');
    expect(hooks.model.webhooks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          deletedAt: null,
          organization: { deletedAt: null },
        },
      })
    );
  });
  it('leitura e contagem do painel preservam perfil e exclusao logica', async () => {
    const hooks = createPrismaRepositoryMock('webhooks');
    const repo = new WebhooksRepository(hooks as any);
    await repo.getWebhooks('org', 'profile');
    await repo.getTotal('org', 'profile');
    const where: Prisma.WebhooksWhereInput = {
      organizationId: 'org',
      profileId: 'profile',
      deletedAt: null,
      organization: { deletedAt: null },
    };
    expect(hooks.model.webhooks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where })
    );
    expect(hooks.model.webhooks.count).toHaveBeenCalledWith({ where });
  });
});
