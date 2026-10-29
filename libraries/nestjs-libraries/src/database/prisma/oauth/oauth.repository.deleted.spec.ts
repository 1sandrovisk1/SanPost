import { createPrismaRepositoryMock } from '../../../test';
import { OAuthRepository } from './oauth.repository';

const build = () => {
  const app = createPrismaRepositoryMock('oAuthApp');
  const auth = createPrismaRepositoryMock('oAuthAuthorization');
  return {
    repo: new OAuthRepository(app as any, auth as any, {} as any, {} as any),
    app: app.model.oAuthApp,
    auth: auth.model.oAuthAuthorization,
  };
};

describe('OAuthRepository - organizacao excluida nao resolve OAuth', () => {
  it('troca de codigo exige organizacao viva e codigo nao revogado', async () => {
    const { repo, auth } = build();
    await repo.findByCode('encrypted-code');
    expect(auth.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          authorizationCode: 'encrypted-code',
          revokedAt: null,
          organization: { deletedAt: null },
          oauthApp: { deletedAt: null, organization: { deletedAt: null } },
        },
      })
    );
  });
  it('token nao resolve organizacao excluida', async () => {
    const { repo, auth } = build();
    await repo.findByAccessToken('encrypted-token');
    expect(auth.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          accessToken: 'encrypted-token',
          revokedAt: null,
          organization: { deletedAt: null },
          oauthApp: { deletedAt: null, organization: { deletedAt: null } },
        },
      })
    );
  });
  it('app cliente deve estar vivo e pertencer a organizacao viva', async () => {
    const { repo, app } = build();
    await repo.getAppByClientId('client-id');
    expect(app.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId: 'client-id',
          deletedAt: null,
          organization: { deletedAt: null },
        },
      })
    );
  });
});
