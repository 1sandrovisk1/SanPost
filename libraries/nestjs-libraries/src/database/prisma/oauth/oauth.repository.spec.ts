import { createPrismaRepositoryMock } from '../../../test';
import { OAuthRepository } from './oauth.repository';

describe('OAuthRepository (perfil do token OAuth)', () => {
  const build = () => {
    const auth = createPrismaRepositoryMock('oAuthAuthorization');
    const userOrg = createPrismaRepositoryMock('userOrganization');
    const member = createPrismaRepositoryMock('profileMember');
    const repo = new OAuthRepository(
      {} as any,
      auth as any,
      userOrg as any,
      member as any
    );
    return { repo, auth, userOrg, member };
  };

  it('aprovacao grava (e reaprovacao troca) o perfil do token', async () => {
    const { repo, auth } = build();
    auth.model.oAuthAuthorization.upsert.mockResolvedValue({} as any);

    await repo.createAuthorization({
      oauthAppId: 'app-1',
      userId: 'user-1',
      organizationId: 'org-1',
      profileId: 'prof-1',
      authorizationCode: 'enc',
      codeExpiresAt: new Date(0),
    });

    const arg = auth.model.oAuthAuthorization.upsert.mock.calls[0][0] as any;
    expect(arg.create.profileId).toBe('prof-1');
    expect(arg.update.profileId).toBe('prof-1');
  });

  it('acesso de quem aprovou: papel na org e no perfil vivo da mesma org', async () => {
    const { repo, userOrg, member } = build();
    userOrg.model.userOrganization.findUnique.mockResolvedValue({ role: 'USER', disabled: false } as any);
    member.model.profileMember.findFirst.mockResolvedValue({ role: 'EDITOR' } as any);

    await expect(repo.getApproverAccess('user-1', 'org-1', 'prof-1')).resolves.toEqual({
      membership: { role: 'USER', disabled: false },
      profileMember: { role: 'EDITOR' },
    });
    expect(userOrg.model.userOrganization.findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'user-1', organizationId: 'org-1' } },
      select: { role: true, disabled: true },
    });
    expect(member.model.profileMember.findFirst).toHaveBeenCalledWith({
      where: {
        profileId: 'prof-1',
        userId: 'user-1',
        profile: { organizationId: 'org-1', deletedAt: null },
      },
      select: { role: true },
    });
  });

  it('token sem perfil nao consulta membro de perfil', async () => {
    const { repo, userOrg, member } = build();
    userOrg.model.userOrganization.findUnique.mockResolvedValue(null);

    await expect(repo.getApproverAccess('user-1', 'org-1', null)).resolves.toEqual({
      membership: null,
      profileMember: null,
    });
    expect(member.model.profileMember.findFirst).not.toHaveBeenCalled();
  });
});
