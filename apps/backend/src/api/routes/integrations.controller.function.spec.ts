jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/nostr.provider',
  () => ({
    NostrProvider: class {
      identifier = 'nostr';
    },
  })
);
jest.mock('@gitroom/nestjs-libraries/crypto/integration-token.helper', () => ({
  decryptIntegrationToken: (_enc: unknown, stored: string) => stored,
}));

import { IntegrationsController } from './integrations.controller';
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const orgUser = { id: 'org-1', users: [{ role: 'USER' }] } as any;
const profile = { id: 'prof-1' } as any;
const integration = {
  id: 'int-1',
  providerIdentifier: 'facebook',
  token: 'tok',
  internalId: 'page-1',
};

const build = () => {
  const provider: any = {
    identifier: 'facebook',
    refreshWait: false,
    pages: jest.fn().mockResolvedValue([{ id: 'p-1' }]),
    mention: jest.fn().mockResolvedValue([]),
    readOrFetch: jest.fn(),
  };
  const manager = {
    getSocialIntegration: jest.fn().mockReturnValue(provider),
    isDashboardCallable: jest
      .fn()
      .mockImplementation(
        (_p: unknown, name: string) => name === 'pages' || name === 'mention'
      ),
  };
  const integrationService = {
    getIntegrationById: jest.fn().mockResolvedValue(integration),
    validateIntegrationProfile: jest.fn().mockResolvedValue(undefined),
    getMentions: jest.fn().mockResolvedValue([]),
    insertMentions: jest.fn(),
  };
  const refreshService = { refresh: jest.fn() };
  const controller = new IntegrationsController(
    manager as any,
    integrationService as any,
    {} as any,
    refreshService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { controller, provider, manager, integrationService, refreshService };
};

// CVE-2026-115931: a rota executava qualquer metodo do provider pelo nome.
describe('IntegrationsController /integrations/function', () => {
  it('rejeita metodo fora da allowlist sem executa-lo', async () => {
    const { controller, provider, integrationService } = build();

    await expect(
      controller.functionIntegration(orgUser, profile, {
        id: 'int-1',
        name: 'readOrFetch',
        data: '/etc/passwd',
      })
    ).rejects.toThrow('Function not found');

    expect(provider.readOrFetch).not.toHaveBeenCalled();
    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledWith(
      'org-1',
      'int-1',
      'prof-1',
      { requireProfile: true }
    );
  });

  it('executa metodo permitido com token, dados, internalId e integracao', async () => {
    const { controller, provider } = build();

    const result = await controller.functionIntegration(orgUser, profile, {
      id: 'int-1',
      name: 'pages',
      data: { a: 1 },
    });

    expect(result).toEqual([{ id: 'p-1' }]);
    expect(provider.pages).toHaveBeenCalledWith(
      'tok',
      { a: 1 },
      'page-1',
      integration
    );
  });

  it('nega quando o perfil nao bate com o canal (valida antes de tocar no token)', async () => {
    const { controller, provider, integrationService } = build();
    integrationService.validateIntegrationProfile.mockRejectedValue(
      new Error('Integration does not belong to this profile')
    );

    await expect(
      controller.functionIntegration(orgUser, profile, {
        id: 'int-1',
        name: 'pages',
        data: {},
      })
    ).rejects.toThrow('Integration does not belong to this profile');

    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
    expect(provider.pages).not.toHaveBeenCalled();
  });

  it('repete a chamada apos refresh do token preservando o perfil', async () => {
    const { controller, provider, refreshService, integrationService } = build();
    provider.pages
      .mockRejectedValueOnce(new RefreshToken('facebook', '{}', '', 'expired'))
      .mockResolvedValueOnce([{ id: 'p-2' }]);
    refreshService.refresh.mockResolvedValue({ accessToken: 'novo' });

    const result = await controller.functionIntegration(orgUser, profile, {
      id: 'int-1',
      name: 'pages',
      data: {},
    });

    expect(result).toEqual([{ id: 'p-2' }]);
    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledTimes(2);
  });
});

describe('IntegrationsController /integrations/mentions', () => {
  it('ignora o nome enviado pelo cliente e chama sempre mention', async () => {
    const { controller, provider, manager } = build();

    await controller.mentions(orgUser, profile, {
      id: 'int-1',
      name: 'readOrFetch',
      data: { query: 'ana' },
    });

    expect(manager.isDashboardCallable).toHaveBeenCalledWith(provider, 'mention');
    expect(provider.mention).toHaveBeenCalledWith(
      'tok',
      { query: 'ana' },
      'page-1',
      integration
    );
    expect(provider.readOrFetch).not.toHaveBeenCalled();
  });
});

// As rotas de plug recebiam so o id do canal: um membro de perfil A criava
// plugs no canal do perfil B.
describe('IntegrationsController plugs (escopo por perfil)', () => {
  it('valida o perfil antes de listar/gravar e nao grava em mismatch', async () => {
    const { controller, integrationService } = build();
    (integrationService as any).createOrUpdatePlug = jest
      .fn()
      .mockResolvedValue({ activated: true });
    (integrationService as any).getPlugsByIntegrationId = jest
      .fn()
      .mockResolvedValue([]);
    const body = { func: 'autoRepostPost', fields: [] } as any;

    await controller.postPlugsByIntegrationId('int-1', orgUser, profile, body);
    await controller.getPlugsByIntegrationId('int-1', orgUser, profile);
    expect(integrationService.validateIntegrationProfile).toHaveBeenCalledWith(
      'org-1',
      'int-1',
      'prof-1',
      { requireProfile: true }
    );

    integrationService.validateIntegrationProfile.mockRejectedValueOnce(
      new Error('Integration does not belong to this profile')
    );
    await expect(
      controller.postPlugsByIntegrationId('int-1', orgUser, profile, body)
    ).rejects.toThrow();
    expect((integrationService as any).createOrUpdatePlug).toHaveBeenCalledTimes(1);
  });

  it('ativar/desativar plug repassa o perfil ao service', async () => {
    const { controller, integrationService } = build();
    (integrationService as any).changePlugActivation = jest
      .fn()
      .mockResolvedValue({ id: 'plug-1' });

    await controller.changePlugActivation('plug-1', orgUser, profile, false);
    expect((integrationService as any).changePlugActivation).toHaveBeenCalledWith(
      'org-1',
      'plug-1',
      false,
      'prof-1',
      { requireProfile: true }
    );
  });
});
