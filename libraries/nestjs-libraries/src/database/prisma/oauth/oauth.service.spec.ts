import { OAuthService } from './oauth.service';

// Token de app OAuth vale o que quem aprovou pode hoje (papel na org e perfil).
describe('OAuthService.getOrgByOAuthToken (papel de quem aprovou)', () => {
  const authorization = (profileId: string | null) => ({
    id: 'auth-1',
    userId: 'user-1',
    organizationId: 'org-1',
    profileId,
    organization: { id: 'org-1' },
  });

  const build = (
    auth: any,
    access: { membership: any; profileMember?: any }
  ) => {
    const repo = {
      findByAccessToken: jest.fn().mockResolvedValue(auth),
      getApproverAccess: jest
        .fn()
        .mockResolvedValue({ profileMember: null, ...access }),
    };
    return { service: new OAuthService(repo as any), repo };
  };

  it('token inexistente ou revogado devolve null sem consultar o acesso', async () => {
    const { service, repo } = build(null, { membership: null });
    await expect(service.getOrgByOAuthToken('pos_x')).resolves.toBeNull();
    expect(repo.getApproverAccess).not.toHaveBeenCalled();
  });

  it('admin aprova para a org inteira', async () => {
    const auth = authorization(null);
    const { service, repo } = build(auth, {
      membership: { role: 'ADMIN', disabled: false },
    });
    await expect(service.getOrgByOAuthToken('pos_x')).resolves.toBe(auth);
    expect(repo.getApproverAccess).toHaveBeenCalledWith('user-1', 'org-1', null);
  });

  it('quem saiu da org ou foi desativado derruba o token', async () => {
    const auth = authorization(null);
    await expect(
      build(auth, { membership: null }).service.getOrgByOAuthToken('pos_x')
    ).resolves.toBeNull();
    await expect(
      build(auth, {
        membership: { role: 'ADMIN', disabled: true },
      }).service.getOrgByOAuthToken('pos_x')
    ).resolves.toBeNull();
  });

  it('USER vale so com token preso a um perfil em que ainda tem escrita', async () => {
    const auth = authorization('prof-1');
    await expect(
      build(auth, {
        membership: { role: 'USER', disabled: false },
        profileMember: { role: 'EDITOR' },
      }).service.getOrgByOAuthToken('pos_x')
    ).resolves.toBe(auth);
    await expect(
      build(auth, {
        membership: { role: 'USER', disabled: false },
        profileMember: { role: 'VIEWER' },
      }).service.getOrgByOAuthToken('pos_x')
    ).resolves.toBeNull();
    await expect(
      build(auth, {
        membership: { role: 'USER', disabled: false },
        profileMember: null,
      }).service.getOrgByOAuthToken('pos_x')
    ).resolves.toBeNull();
  });

  it('token org-wide antigo aprovado por USER deixa de valer', async () => {
    await expect(
      build(authorization(null), {
        membership: { role: 'USER', disabled: false },
      }).service.getOrgByOAuthToken('pos_x')
    ).resolves.toBeNull();
  });
});

describe('OAuthService.createAuthorizationCode', () => {
  it('grava o perfil do token junto do codigo', async () => {
    const repo = { createAuthorization: jest.fn().mockResolvedValue({}) };
    const service = new OAuthService(repo as any);

    const code = await service.createAuthorizationCode('app-1', 'user-1', 'org-1', 'prof-1');

    expect(code).toHaveLength(32);
    expect(repo.createAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({
        oauthAppId: 'app-1',
        userId: 'user-1',
        organizationId: 'org-1',
        profileId: 'prof-1',
      })
    );
  });
});

describe('OAuthService.exchangeCodeForToken (endurecimento)', () => {
  const { AuthService } = jest.requireActual('@gitroom/helpers/auth/auth.service');
  const build = (over: Record<string, jest.Mock> = {}) => {
    const repo = {
      getAppByClientId: jest.fn().mockResolvedValue({
        id: 'app-1',
        clientSecret: AuthService.fixedEncryption('segredo-certo'),
      }),
      findByCode: jest.fn().mockResolvedValue({
        id: 'auth-1',
        oauthAppId: 'app-1',
        codeExpiresAt: new Date(Date.now() + 60_000),
      }),
      exchangeCodeForToken: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      ...over,
    };
    return { service: new OAuthService(repo as any), repo };
  };

  it('devolve o token sem o cliente Stripe da org (cus)', async () => {
    const { service, repo } = build();

    const result = await service.exchangeCodeForToken('codigo', 'pca_1', 'segredo-certo');

    expect(result).toEqual({
      id: 'org-1',
      access_token: expect.stringMatching(/^pos_/),
      token_type: 'bearer',
    });
    expect(repo.exchangeCodeForToken).toHaveBeenCalledWith(
      'auth-1',
      expect.any(String),
      AuthService.fixedEncryption('codigo')
    );
  });

  it('segredo errado (de qualquer tamanho) responde invalid_client', async () => {
    const { service, repo } = build();

    for (const secret of ['segredo-errad', 'x', '']) {
      await expect(
        service.exchangeCodeForToken('codigo', 'pca_1', secret)
      ).rejects.toMatchObject({ status: 401 });
    }
    expect(repo.findByCode).not.toHaveBeenCalled();
  });

  it('codigo ja trocado (troca concorrente) responde invalid_grant', async () => {
    const { service } = build({
      exchangeCodeForToken: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' })),
    });

    await expect(
      service.exchangeCodeForToken('codigo', 'pca_1', 'segredo-certo')
    ).rejects.toMatchObject({ status: 400 });
  });

  it('erro de banco na troca nao vira invalid_grant', async () => {
    const outage = new Error('connection refused');
    const { service } = build({
      exchangeCodeForToken: jest.fn().mockRejectedValue(outage),
    });

    await expect(
      service.exchangeCodeForToken('codigo', 'pca_1', 'segredo-certo')
    ).rejects.toBe(outage);
  });
});
