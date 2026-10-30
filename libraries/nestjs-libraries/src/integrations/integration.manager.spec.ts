import 'reflect-metadata';

jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/nostr.provider',
  () => ({
    NostrProvider: class {
      identifier = 'nostr';
    },
  })
);

import { IntegrationManager } from './integration.manager';

describe('IntegrationManager.getProviderCredentials', () => {
  it('reutiliza a credencial Google do YouTube no GMB', async () => {
    const credentialService = {
      getRawShared: jest
        .fn()
        .mockImplementation(
          async (
            _organizationId: string,
            provider: string,
            _profileId?: string
          ) =>
            provider === 'youtube'
              ? {
                  clientId: 'google-client-id',
                  clientSecret: 'google-client-secret',
                }
              : undefined
        ),
    };
    const manager = new IntegrationManager(credentialService as any);

    await expect(
      manager.getProviderCredentials('gmb', 'org-1', 'profile-1')
    ).resolves.toEqual({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });
    expect(credentialService.getRawShared).toHaveBeenCalledWith(
      'org-1',
      'youtube',
      'profile-1'
    );
  });
});

describe('IntegrationManager - TikTok for Business', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('registra o provider tiktok-business', () => {
    const manager = new IntegrationManager();
    expect(manager.getAllowedSocialsIntegrations()).toContain('tiktok-business');
    expect(manager.getSocialIntegration('tiktok-business').name).toBe(
      'TikTok Business'
    );
  });

  it('usa a credencial propria do workspace/perfil, sem alias para o tiktok nativo', async () => {
    const credentialService = {
      getRawShared: jest.fn().mockResolvedValue({
        clientId: 'biz-app',
        clientSecret: 'biz-secret',
      }),
    };
    const manager = new IntegrationManager(credentialService as any);

    await expect(
      manager.getProviderCredentials('tiktok-business', 'org-1', 'profile-1')
    ).resolves.toEqual({ clientId: 'biz-app', clientSecret: 'biz-secret' });
    expect(credentialService.getRawShared).toHaveBeenCalledWith(
      'org-1',
      'tiktok-business',
      'profile-1'
    );
  });

  it('sem credencial salva cai nas variaveis TIKTOK_BUSINESS_*', async () => {
    process.env.TIKTOK_BUSINESS_CLIENT_ID = 'env-biz';
    process.env.TIKTOK_BUSINESS_CLIENT_SECRET = 'env-biz-secret';
    const manager = new IntegrationManager({
      getRawShared: jest.fn().mockResolvedValue(undefined),
    } as any);

    await expect(
      manager.getProviderCredentials('tiktok-business', 'org-1')
    ).resolves.toEqual({ clientId: 'env-biz', clientSecret: 'env-biz-secret' });
  });
});

// CVE-2026-115931: POST /integrations/function executava QUALQUER metodo do
// provider pelo nome vindo do cliente (ex.: readOrFetch -> readFileSync).
describe('IntegrationManager.isDashboardCallable', () => {
  const manager = new IntegrationManager({} as any);
  const provider = (identifier: string) => {
    const found = manager.getSocialIntegration(identifier);
    if (!found) {
      throw new Error(`provider ${identifier} nao registrado`);
    }
    return found;
  };

  // Tudo que o frontend chama via useCustomProviderFunction, linkedin.component
  // e with-continue-provider (endpoint 'pages'/'companies'), mais 'mention'.
  const dashboardCalls: Array<[string, string]> = [
    ['facebook', 'pages'],
    ['instagram', 'pages'],
    ['instagram','audioSearch'],
    ['tumblr','pages'],
    ['youtube', 'pages'],
    ['gmb', 'pages'],
    ['linkedin-page', 'companies'],
    ['linkedin', 'company'],
    ['linkedin', 'mention'],
    ['x', 'mention'],
    ['bluesky', 'mention'],
    ['discord', 'mention'],
    ['threads', 'mention'],
    ['facebook', 'mention'],
    ['reddit', 'subreddits'],
    ['reddit', 'restrictions'],
    ['lemmy', 'subreddits'],
    ['wrapcast', 'subreddits'],
    ['discord', 'channels'],
    ['slack', 'channels'],
    ['pinterest', 'boards'],
    ['medium', 'publications'],
    ['hashnode', 'publications'],
    ['hashnode', 'tags'],
    ['devto', 'tags'],
    ['devto', 'organizations'],
    ['skool', 'groups'],
    ['skool', 'label'],
    ['mewe', 'groups'],
    ['whop', 'companies'],
    ['whop', 'experiences'],
    ['listmonk', 'list'],
    ['listmonk', 'templates'],
    ['dribbble', 'teams'],
    ['wordpress', 'postTypes'],
    ['wordpress', 'categoriesList'],
    ['wordpress', 'tagsList'],
    ['tiktok-business', 'musicSearch'],
    ['tiktok-business', 'locationSearch'],
  ];

  it.each(dashboardCalls)(
    'permite %s.%s (chamado pelo dashboard)',
    (identifier, method) => {
      expect(manager.isDashboardCallable(provider(identifier), method)).toBe(
        true
      );
    }
  );

  it('herda a marcacao de mention mesmo quando a subclasse sobrescreve o metodo', () => {
    const x = provider('x');
    expect(Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(x), 'mention')).toBe(true);
    expect(manager.isDashboardCallable(x, 'mention')).toBe(true);
  });

  it.each([
    'readOrFetch',
    'fetch',
    'post',
    'authenticate',
    'refreshToken',
    'generateAuthUrl',
    'handleErrors',
    'constructor',
    'toString',
    'hasOwnProperty',
    '__proto__',
    'naoExiste',
  ])('bloqueia %s (nao e @Tool nem @DashboardFunction)', (method) => {
    expect(manager.isDashboardCallable(provider('facebook'), method)).toBe(
      false
    );
    expect(manager.isDashboardCallable(provider('linkedin'), method)).toBe(
      false
    );
  });

  it('bloqueia nomes que nao sao string', () => {
    expect(manager.isDashboardCallable(provider('facebook'), undefined)).toBe(false);
    expect(manager.isDashboardCallable(provider('facebook'), null)).toBe(false);
    expect(manager.isDashboardCallable(provider('facebook'), '')).toBe(false);
    expect(manager.isDashboardCallable(provider('facebook'), ['pages'])).toBe(false);
  });

  it('bloqueia propriedades que nao sao funcao mesmo que existam', () => {
    expect(manager.isDashboardCallable(provider('facebook'), 'identifier')).toBe(false);
    expect(manager.isDashboardCallable(provider('facebook'), 'scopes')).toBe(false);
  });
});

 describe('IntegrationManager - Tumblr',()=>{
  it('registra Tumblr e resolve app pelo perfil sem alias',async()=>{
   const credentials={getRawShared:jest.fn().mockResolvedValue({clientId:'tumblr-app',clientSecret:'tumblr-secret'})};const manager=new IntegrationManager(credentials as any);
   expect(manager.getAllowedSocialsIntegrations()).toContain('tumblr');
   expect(await manager.getProviderCredentials('tumblr','org','profile')).toEqual({clientId:'tumblr-app',clientSecret:'tumblr-secret'});
   expect(credentials.getRawShared).toHaveBeenCalledWith('org','tumblr','profile');
  });
 });
