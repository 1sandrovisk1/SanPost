jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/nostr.provider',
  () => ({
    NostrProvider: class {
      identifier = 'nostr';
    },
  })
);
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
}));

import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { IntegrationsController } from './integrations.controller';
import { CHECK_POLICIES_KEY } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ThrottlerOrgUserGuard } from '@gitroom/nestjs-libraries/throttler/throttler.provider';

const REQUEST_ID = 'A'.repeat(32);

// Conexao de canal Farcaster: rotas autenticadas que amarram o signer a
// org/usuario/perfil de quem chama e ao state do fluxo.
describe('IntegrationsController /integrations/farcaster/signer', () => {
  const setup = () => {
    const farcaster = {
      startChannel: jest.fn().mockResolvedValue({ requestId: REQUEST_ID }),
      channelStatus: jest.fn().mockResolvedValue({ status: 'approved' }),
    };
    const controller = new IntegrationsController(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      farcaster as any
    );
    return { controller, farcaster };
  };

  it('POST cria o signer com org, usuario, perfil e state de quem chama', async () => {
    const { controller, farcaster } = setup();

    await expect(
      controller.farcasterSigner(
        { id: 'org-1' } as any,
        { id: 'user-1' } as any,
        { id: 'profile-1' } as any,
        { state: 'state1234' }
      )
    ).resolves.toEqual({ requestId: REQUEST_ID });

    expect(farcaster.startChannel).toHaveBeenCalledWith('state1234', {
      orgId: 'org-1',
      userId: 'user-1',
      profileId: 'profile-1',
    });
  });

  it('sem perfil ativo o vinculo usa profileId null', async () => {
    const { controller, farcaster } = setup();

    await controller.farcasterSigner(
      { id: 'org-1' } as any,
      { id: 'user-1' } as any,
      null,
      { state: 'state1234' }
    );

    expect(farcaster.startChannel).toHaveBeenCalledWith('state1234', {
      orgId: 'org-1',
      userId: 'user-1',
      profileId: null,
    });
  });

  it('status consulta com o requestId do corpo e a org/usuario de quem chama', async () => {
    const { controller, farcaster } = setup();

    await expect(
      controller.farcasterSignerStatus(
        { id: 'org-1' } as any,
        { id: 'user-1' } as any,
        { requestId: REQUEST_ID }
      )
    ).resolves.toEqual({ status: 'approved' });

    expect(farcaster.channelStatus).toHaveBeenCalledWith(REQUEST_ID, {
      orgId: 'org-1',
      userId: 'user-1',
    });
  });

  it.each(['farcasterSigner', 'farcasterSignerStatus'] as const)(
    '%s exige a policy de criar canal e limita por org/usuario',
    (method) => {
      const handler = IntegrationsController.prototype[method];
      expect(Reflect.getMetadata(CHECK_POLICIES_KEY, handler)).toEqual([
        [AuthorizationActions.Create, Sections.CHANNEL],
      ]);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([
        ThrottlerOrgUserGuard,
      ]);
    }
  );
});
