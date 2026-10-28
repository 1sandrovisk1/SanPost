jest.mock('@gitroom/backend/services/auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/services/email.service', () => ({
  EmailService: class {},
}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));

import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { AuthController } from './auth.controller';

const SIGNER = '19d0c5fd-9b33-4a48-a0e2-bc7b0555baec';

// Login com Farcaster (upstream #2078): as rotas publicas so criam/consultam
// signer com o login ligado (NEYNAR_CLIENT_ID + Neynar configurada).
describe('AuthController /auth/farcaster/signer', () => {
  const setup = (enabled: boolean) => {
    const farcaster = {
      isLoginEnabled: jest.fn().mockReturnValue(enabled),
      start: jest.fn().mockResolvedValue({ signerUuid: SIGNER }),
      status: jest.fn().mockResolvedValue({ status: 'pending_approval' }),
    };
    const controller = new AuthController(
      {} as any,
      {} as any,
      farcaster as any
    );
    return { controller, farcaster };
  };

  it('com o login ligado cria e consulta o signer pelo service', async () => {
    const { controller, farcaster } = setup(true);

    await expect(controller.farcasterSigner()).resolves.toEqual({
      signerUuid: SIGNER,
    });
    await expect(controller.farcasterSignerStatus(SIGNER)).resolves.toEqual({
      status: 'pending_approval',
    });
    expect(farcaster.status).toHaveBeenCalledWith(SIGNER);
  });

  it('com o login desligado responde 404 sem tocar a Neynar', async () => {
    const { controller, farcaster } = setup(false);

    for (const call of [
      () => controller.farcasterSigner(),
      () => controller.farcasterSignerStatus(SIGNER),
    ]) {
      const error = await call().catch((e) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(404);
    }
    expect(farcaster.start).not.toHaveBeenCalled();
    expect(farcaster.status).not.toHaveBeenCalled();
  });
});
