import 'reflect-metadata';

// o IntegrationManager real carrega todos os providers (nostr-tools e ESM)
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));

const mockRedis = new Map<string, string>();
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {
    set: jest.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && mockRedis.has(key)) return null;
      mockRedis.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => mockRedis.get(key) ?? null),
    del: jest.fn(async (key: string) => (mockRedis.delete(key) ? 1 : 0)),
  },
}));

import { HttpException, Logger } from '@nestjs/common';
import { createMock } from '@gitroom/nestjs-libraries/test';
import type { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  FarcasterNeynarError,
  type FarcasterProvider,
} from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import { farcasterSignerRegistry } from './farcaster.signer.registry';
import { FarcasterSignerService } from './farcaster.signer.service';

const SIGNER = '19d0c5fd-9b33-4a48-a0e2-bc7b0555baec';
const CREATED = {
  signerUuid: SIGNER,
  approvalUrl: 'https://client.farcaster.xyz/x',
  qrCode: 'data:image/png;base64,AAA',
};
const CHANNEL = { orgId: 'org-1', userId: 'user-1', profileId: 'profile-1' };

describe('FarcasterSignerService', () => {
  let provider: ReturnType<typeof createMock<FarcasterProvider>>;
  let manager: ReturnType<typeof createMock<IntegrationManager>>;
  let service: FarcasterSignerService;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;
  const sponsor = process.env.NEYNAR_SPONSOR_SIGNERS;

  beforeEach(() => {
    mockRedis.clear();
    provider = createMock<FarcasterProvider>();
    manager = createMock<IntegrationManager>();
    manager.getSocialIntegration.mockReturnValue(provider);
    provider.isConfigured.mockReturnValue(true);
    provider.isLoginEnabled.mockReturnValue(true);
    provider.createSigner.mockResolvedValue(CREATED);
    service = new FarcasterSignerService(manager);
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    errorLog.mockRestore();
    warnLog.mockRestore();
    if (sponsor === undefined) {
      delete process.env.NEYNAR_SPONSOR_SIGNERS;
    } else {
      process.env.NEYNAR_SPONSOR_SIGNERS = sponsor;
    }
  });

  const startLogin = async () => {
    const { body, nonce } = await service.startLogin();
    return { requestId: (body as { requestId: string }).requestId, nonce: nonce! };
  };

  describe('login (rotas publicas)', () => {
    it('com o login desligado responde 404 sem criar signer', async () => {
      provider.isLoginEnabled.mockReturnValue(false);

      const error = await service.startLogin().catch((e) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect(error.getStatus()).toBe(404);
      expect(provider.createSigner).not.toHaveBeenCalled();
      await expect(service.loginStatus('x', 'y')).rejects.toBeInstanceOf(
        HttpException
      );
    });

    it('cria signer sem patrocinio e devolve so o requestId opaco + nonce do cookie', async () => {
      process.env.NEYNAR_SPONSOR_SIGNERS = 'true';

      const { body, nonce } = await service.startLogin();

      expect(provider.createSigner).toHaveBeenCalledWith({ sponsor: false });
      expect(body).toEqual({
        requestId: expect.stringMatching(/^[A-Za-z0-9]{32}$/),
        approvalUrl: CREATED.approvalUrl,
        qrCode: CREATED.qrCode,
      });
      expect(JSON.stringify(body)).not.toContain(SIGNER);
      expect(nonce).toMatch(/^[A-Za-z0-9]{32}$/);
      // o nonce cru nao vai para o Redis
      expect([...mockRedis.values()].join()).not.toContain(nonce!);
    });

    it('status exige o cookie do navegador que criou o signer', async () => {
      const { requestId, nonce } = await startLogin();
      provider.lookupSigner.mockResolvedValue({ status: 'pending_approval' });

      await expect(service.loginStatus(requestId, nonce)).resolves.toEqual({
        status: 'pending_approval',
      });
      await expect(service.loginStatus(requestId, 'outro-nonce')).resolves.toEqual(
        { error: 'invalid_signer' }
      );
      await expect(service.loginStatus(requestId, undefined)).resolves.toEqual({
        error: 'invalid_signer',
      });
      expect(provider.lookupSigner).toHaveBeenCalledTimes(1);
      expect(provider.lookupSigner).toHaveBeenCalledWith(SIGNER);
    });

    it.each([
      ['invalid_signer'],
      ['key_refused'],
      ['no_credits'],
      ['rate_limited'],
    ] as const)('falha permanente da Neynar volta com o codigo %s', async (reason) => {
      const { requestId, nonce } = await startLogin();
      provider.lookupSigner.mockRejectedValue(new FarcasterNeynarError(reason));

      await expect(service.loginStatus(requestId, nonce)).resolves.toEqual({
        error: reason,
      });
    });

    it('falha transitoria volta como failed e e logada', async () => {
      const { requestId, nonce } = await startLogin();
      provider.lookupSigner.mockRejectedValue(new Error('network down'));

      await expect(service.loginStatus(requestId, nonce)).resolves.toEqual({
        error: 'failed',
      });
      expect(warnLog).toHaveBeenCalledTimes(1);
    });

    it('assertLoginCode recusa code desconhecido, de canal ou com outro cookie (400)', async () => {
      const { requestId, nonce } = await startLogin();
      const channelId = await farcasterSignerRegistry.issue({
        purpose: 'channel',
        signerUuid: SIGNER,
        orgId: 'org-1',
        userId: 'user-1',
        profileId: null,
        state: 'state1234',
      });

      await expect(service.assertLoginCode(requestId, nonce)).resolves.toBeUndefined();
      for (const [code, cookie] of [
        ['A'.repeat(32), nonce],
        [channelId, nonce],
        [requestId, 'outro'],
        [requestId, undefined],
      ]) {
        const error = await service.assertLoginCode(code, cookie).catch((e) => e);
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toMatchObject({
          code: 'farcaster_invalid_code',
        });
      }
      expect(provider.lookupSigner).not.toHaveBeenCalled();
    });

    it('assertLoginCode respeita o gate do login (404)', async () => {
      const { requestId, nonce } = await startLogin();
      provider.isLoginEnabled.mockReturnValue(false);

      const error = await service.assertLoginCode(requestId, nonce).catch((e) => e);
      expect(error.getStatus()).toBe(404);
    });

    it('loginToken devolve o proprio requestId so com o signer aprovado', async () => {
      const { requestId } = await startLogin();
      provider.lookupSigner.mockResolvedValueOnce({ status: 'approved', fid: 7 });
      await expect(service.loginToken(requestId)).resolves.toBe(requestId);

      provider.lookupSigner.mockResolvedValueOnce({ status: 'pending_approval' });
      await expect(service.loginToken(requestId)).rejects.toBeInstanceOf(
        HttpException
      );

      // Neynar 404 (signer desconhecido) vira 400 estavel, nunca 500
      provider.lookupSigner.mockRejectedValueOnce(
        new FarcasterNeynarError('invalid_signer')
      );
      const error = await service.loginToken(requestId).catch((e) => e);
      expect(error.getStatus()).toBe(400);
    });

    it('loginIdentity identifica pelo fid e nega signer nao aprovado', async () => {
      const { requestId } = await startLogin();
      provider.lookupSigner.mockResolvedValueOnce({ status: 'approved', fid: 777 });
      await expect(service.loginIdentity(requestId)).resolves.toEqual({
        id: 'farcaster_777',
        email: 'farcaster_777',
      });

      provider.lookupSigner.mockResolvedValueOnce({ status: 'revoked' });
      await expect(service.loginIdentity(requestId)).resolves.toBe(false);

      provider.lookupSigner.mockRejectedValueOnce(
        new FarcasterNeynarError('invalid_signer')
      );
      await expect(service.loginIdentity(requestId)).resolves.toBe(false);

      await expect(service.loginIdentity('A'.repeat(32))).resolves.toBe(false);
    });

    it('reserva o code antes dos efeitos e recusa trocas concorrentes', async () => {
      const { requestId, nonce } = await startLogin();
      const results = await Promise.allSettled([
        service.claimLoginCode(requestId, nonce), service.claimLoginCode(requestId, nonce),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      await service.releaseLoginClaim(requestId);
      await expect(service.claimLoginCode(requestId, nonce)).resolves.toBeUndefined();
    });

    it('segundo consumo falha em vez de entregar outra sessao', async () => {
      const { requestId } = await startLogin();
      await service.consumeLogin(requestId);
      await expect(service.consumeLogin(requestId)).rejects.toBeInstanceOf(HttpException);
    });

    it('consumeLogin apaga o registro (uso unico)', async () => {
      const { requestId, nonce } = await startLogin();

      await service.consumeLogin(requestId);

      await expect(service.assertLoginCode(requestId, nonce)).rejects.toBeInstanceOf(
        HttpException
      );
    });

    it('falha ao criar o signer vira codigo generico e o log usa o resumo do erro', async () => {
      provider.createSigner.mockRejectedValue(
        new Error('boom Authorization: Bearer sk-secret-123456789')
      );

      const { body, nonce } = await service.startLogin();
      expect(body).toEqual({ error: 'failed' });
      expect(nonce).toBeUndefined();
      expect(String(errorLog.mock.calls[0][0])).not.toContain('sk-secret-123456789');
    });
  });

  describe('canal (rotas autenticadas)', () => {
    const flowState = 'state1234';
    const seedState = (org = CHANNEL.orgId, profile: string | null = CHANNEL.profileId) => {
      mockRedis.set(`organization:${flowState}`, org);
      if (profile) {
        mockRedis.set(`profile:${flowState}`, profile);
      }
    };

    it('sem a Neynar configurada devolve not_configured', async () => {
      seedState();
      provider.isConfigured.mockReturnValue(false);

      await expect(service.startChannel(flowState, CHANNEL)).resolves.toEqual({
        error: 'not_configured',
      });
      expect(provider.createSigner).not.toHaveBeenCalled();
    });

    it('amarra o signer a org/usuario/perfil/state e patrocina conforme a env', async () => {
      seedState();
      process.env.NEYNAR_SPONSOR_SIGNERS = 'true';

      const result = await service.startChannel(flowState, CHANNEL);

      expect(provider.createSigner).toHaveBeenCalledWith({ sponsor: true });
      const { requestId } = result as { requestId: string };
      await expect(farcasterSignerRegistry.get(requestId)).resolves.toEqual({
        purpose: 'channel',
        signerUuid: SIGNER,
        orgId: 'org-1',
        userId: 'user-1',
        profileId: 'profile-1',
        state: flowState,
      });
      expect(JSON.stringify(result)).not.toContain(SIGNER);
    });

    it.each([
      ['state de outra org', () => seedState('org-2')],
      ['state de outro perfil', () => seedState(CHANNEL.orgId, 'profile-2')],
      ['state inexistente', () => undefined],
    ])('recusa %s sem criar signer', async (_name, seed) => {
      seed();

      await expect(service.startChannel(flowState, CHANNEL)).resolves.toEqual({
        error: 'invalid_state',
      });
      expect(provider.createSigner).not.toHaveBeenCalled();
    });

    it('recusa state fora do formato', async () => {
      await expect(service.startChannel('../x', CHANNEL)).resolves.toEqual({
        error: 'invalid_state',
      });
    });

    it('status so para a mesma org e o mesmo usuario', async () => {
      seedState();
      const { requestId } = (await service.startChannel(flowState, CHANNEL)) as {
        requestId: string;
      };
      provider.lookupSigner.mockResolvedValue({ status: 'approved', fid: 7 });

      await expect(
        service.channelStatus(requestId, { orgId: 'org-1', userId: 'user-1' })
      ).resolves.toEqual({ status: 'approved' });
      await expect(
        service.channelStatus(requestId, { orgId: 'org-2', userId: 'user-1' })
      ).resolves.toEqual({ error: 'invalid_signer' });
      await expect(
        service.channelStatus(requestId, { orgId: 'org-1', userId: 'user-2' })
      ).resolves.toEqual({ error: 'invalid_signer' });
      await expect(
        service.channelStatus('A'.repeat(32), { orgId: 'org-1', userId: 'user-1' })
      ).resolves.toEqual({ error: 'invalid_signer' });
      expect(provider.lookupSigner).toHaveBeenCalledTimes(1);
    });
  });
});
