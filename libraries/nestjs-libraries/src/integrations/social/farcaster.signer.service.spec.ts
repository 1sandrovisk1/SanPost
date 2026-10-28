import 'reflect-metadata';

// o IntegrationManager real carrega todos os providers (nostr-tools e ESM)
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));

import { Logger } from '@nestjs/common';
import { createMock } from '@gitroom/nestjs-libraries/test';
import type { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import type { FarcasterProvider } from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import { FarcasterSignerService } from './farcaster.signer.service';

const SIGNER = '19d0c5fd-9b33-4a48-a0e2-bc7b0555baec';

describe('FarcasterSignerService', () => {
  let provider: ReturnType<typeof createMock<FarcasterProvider>>;
  let manager: ReturnType<typeof createMock<IntegrationManager>>;
  let service: FarcasterSignerService;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;
  const clientId = process.env.NEYNAR_CLIENT_ID;

  beforeEach(() => {
    provider = createMock<FarcasterProvider>();
    manager = createMock<IntegrationManager>();
    manager.getSocialIntegration.mockReturnValue(provider);
    provider.isConfigured.mockReturnValue(true);
    service = new FarcasterSignerService(manager);
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    errorLog.mockRestore();
    warnLog.mockRestore();
    if (clientId === undefined) {
      delete process.env.NEYNAR_CLIENT_ID;
    } else {
      process.env.NEYNAR_CLIENT_ID = clientId;
    }
  });

  describe('start', () => {
    it('usa o provider wrapcast e devolve o pedido de aprovacao', async () => {
      const request = {
        signerUuid: SIGNER,
        approvalUrl: 'https://client.farcaster.xyz/x',
        qrCode: 'data:image/png;base64,AAA',
      };
      provider.createSigner.mockResolvedValue(request);

      await expect(service.start()).resolves.toEqual(request);
      expect(manager.getSocialIntegration).toHaveBeenCalledWith('wrapcast');
    });

    it('sem a Neynar configurada devolve not_configured sem criar signer', async () => {
      provider.isConfigured.mockReturnValue(false);

      await expect(service.start()).resolves.toEqual({ error: 'not_configured' });
      expect(provider.createSigner).not.toHaveBeenCalled();
    });

    it('falha da Neynar vira codigo generico e o log usa o resumo do erro', async () => {
      provider.createSigner.mockRejectedValue(
        new Error('boom Authorization: Bearer sk-secret-123456789')
      );

      await expect(service.start()).resolves.toEqual({ error: 'failed' });
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(String(errorLog.mock.calls[0][0])).not.toContain('sk-secret-123456789');
    });
  });

  describe('status', () => {
    it.each([undefined, '', 'abc', '../signer', 42])(
      'signerUuid invalido (%s) nao chega a Neynar',
      async (value) => {
        await expect(service.status(value)).resolves.toEqual({
          error: 'invalid_signer',
        });
        expect(provider.signerStatus).not.toHaveBeenCalled();
      }
    );

    it('repassa o status do provider', async () => {
      provider.signerStatus.mockResolvedValue({ status: 'approved', code: 'abc' });

      await expect(service.status(SIGNER)).resolves.toEqual({
        status: 'approved',
        code: 'abc',
      });
      expect(provider.signerStatus).toHaveBeenCalledWith(SIGNER);
    });

    it('sem a Neynar configurada devolve not_configured', async () => {
      provider.isConfigured.mockReturnValue(false);

      await expect(service.status(SIGNER)).resolves.toEqual({
        error: 'not_configured',
      });
    });

    it('falha transitoria devolve failed para o modal seguir consultando', async () => {
      provider.signerStatus.mockRejectedValue(new Error('network down'));

      await expect(service.status(SIGNER)).resolves.toEqual({ error: 'failed' });
      expect(warnLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('isLoginEnabled', () => {
    it('exige NEYNAR_CLIENT_ID (gate do botao) e a Neynar configurada', () => {
      delete process.env.NEYNAR_CLIENT_ID;
      expect(service.isLoginEnabled()).toBe(false);

      process.env.NEYNAR_CLIENT_ID = 'client-id';
      expect(service.isLoginEnabled()).toBe(true);

      provider.isConfigured.mockReturnValue(false);
      expect(service.isLoginEnabled()).toBe(false);
    });
  });
});
