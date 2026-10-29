import { OrganizationDeletionRepository } from './organization.deletion.repository';
describe('transacao de exclusao de organizacao', () => {
  it('revoga acessos e interrompe filas atomicamente, sem excluir User', async () => {
    const models = [
      'organization',
      'profile',
      'integration',
      'post',
      'reviewLink',
      'oAuthAuthorization',
      'flow',
      'repostRule',
      'autoPost',
      'userOrganization',
      'plugs',
      'webhooks',
      'oAuthApp',
    ];
    const tx: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin' }) },
    };
    for (const model of models)
      tx[model] = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
    const transaction = jest.fn(async (callback: any) => callback(tx));
    const repo = new OrganizationDeletionRepository(
      { model: { $transaction: transaction } } as any,
      {} as any,
      {} as any
    );
    expect(await repo.softDelete('org', 'admin', 'Workspace')).toBe(true);
    expect(tx.organization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'org',
          name: 'Workspace',
          deletedAt: null,
        }),
        data: expect.objectContaining({
          apiKey: null,
          deletedAt: expect.any(Date),
        }),
      })
    );
    expect(tx.profile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org' },
        data: expect.objectContaining({ apiKey: null }),
      })
    );
    expect(tx.oAuthAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accessToken: null,
          authorizationCode: null,
          revokedAt: expect.any(Date),
        }),
      })
    );
    expect(tx.oAuthAuthorization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { organizationId: 'org' },
            { oauthApp: { organizationId: 'org' } },
          ],
        },
      })
    );
    expect(tx.oAuthApp.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.plugs.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
      data: { activated: false },
    });
    expect(tx.webhooks.updateMany).toHaveBeenCalledWith({
      where: { organizationId: 'org' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.user).not.toHaveProperty('deleteMany');
  });
  it('reconfere admin no banco dentro da transacao', async () => {
    const tx: any = {
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      organization: { updateMany: jest.fn() },
    };
    const repo = new OrganizationDeletionRepository(
      { model: { $transaction: async (callback: any) => callback(tx) } } as any,
      {} as any,
      {} as any
    );
    expect(await repo.softDelete('org', 'nonadmin', 'Workspace')).toBe(false);
    expect(tx.organization.updateMany).not.toHaveBeenCalled();
  });
  it('nome trocado, tombstone ou assinatura ativa interrompem antes de revogar recursos', async () => {
    const tx: any = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'admin' }) },
      organization: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      profile: { updateMany: jest.fn() },
    };
    const repo = new OrganizationDeletionRepository(
      { model: { $transaction: async (callback: any) => callback(tx) } } as any,
      {} as any,
      {} as any
    );
    expect(await repo.softDelete('org', 'admin', 'Nome anterior')).toBe(false);
    expect(tx.profile.updateMany).not.toHaveBeenCalled();
    expect(tx.organization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'org',
          name: 'Nome anterior',
          deletedAt: null,
          OR: expect.any(Array),
        }),
      })
    );
  });
});
