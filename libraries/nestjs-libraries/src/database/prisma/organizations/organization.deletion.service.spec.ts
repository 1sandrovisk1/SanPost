import { OrganizationDeletionService } from './organization.deletion.service';
import { OrganizationDeletionRepository } from './organization.deletion.repository';
import { createMock } from '@gitroom/nestjs-libraries/test';
describe('exclusao de organizacao', () => {
  const build = () => {
    const repo = createMock<OrganizationDeletionRepository>();
    repo.getContext.mockResolvedValue({
      actor: { isSuperAdmin: true },
      org: {
        id: 'org',
        name: 'Workspace',
        deletedAt: null,
        subscription: null,
      },
    } as any);
    repo.softDelete.mockResolvedValue(true);
    return { repo, service: new OrganizationDeletionService(repo) };
  };
  it('SUPERADMIN da org sem admin da plataforma nao pode excluir', async () => {
    const { repo, service } = build();
    repo.getContext.mockResolvedValue({
      actor: { isSuperAdmin: false },
      org: { name: 'Workspace' },
    } as any);
    await expect(
      service.delete('org', 'actor', 'Workspace')
    ).rejects.toMatchObject({ status: 403 });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
  it('exige confirmacao exata do nome', async () => {
    const { repo, service } = build();
    await expect(
      service.delete('org', 'actor', 'workspace')
    ).rejects.toMatchObject({ status: 400 });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
  it('bloqueia assinatura ativa antes de mutar', async () => {
    const { repo, service } = build();
    repo.getContext.mockResolvedValue({
      actor: { isSuperAdmin: true },
      org: {
        name: 'Workspace',
        deletedAt: null,
        subscription: {
          identifier: 'sub',
          isLifetime: false,
          deletedAt: null,
          cancelAt: null,
        },
      },
    } as any);
    await expect(
      service.delete('org', 'actor', 'Workspace')
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.softDelete).not.toHaveBeenCalled();
  });
  it('admin confirmado exclui logicamente sem apagar usuarios', async () => {
    const { repo, service } = build();
    await expect(service.delete('org', 'actor', 'Workspace')).resolves.toEqual({
      success: true,
    });
    expect(repo.softDelete).toHaveBeenCalledWith('org', 'actor', 'Workspace');
  });
});
