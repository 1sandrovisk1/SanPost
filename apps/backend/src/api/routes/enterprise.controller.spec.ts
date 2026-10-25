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

import { sign } from 'jsonwebtoken';
import { EnterpriseController } from './enterprise.controller';

// CVE-2026-94455: qualquer JWT assinado com JWT_SECRET (login, convite, reset)
// criava uma org ULTIMATE vitalicia e devolvia a apiKey.
describe('EnterpriseController /enterprise/create-user', () => {
  const ORIGINAL = process.env.JWT_SECRET;
  const secret = 'segredo-de-teste';
  let organizationService: { createMaxUser: jest.Mock };
  let controller: EnterpriseController;

  beforeAll(() => {
    process.env.JWT_SECRET = secret;
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL;
  });

  beforeEach(() => {
    organizationService = {
      createMaxUser: jest.fn().mockResolvedValue({ id: 'org-max', apiKey: 'k' }),
    };
    controller = new EnterpriseController(
      {} as any,
      organizationService as any,
      {} as any,
      {} as any
    );
  });

  it('recusa o token de login do proprio usuario', async () => {
    const login = sign(
      { id: 'user-1', name: 'Alguem', email: 'a@b.c', providerName: 'LOCAL' },
      secret
    );

    await expect(controller.createUser(login)).resolves.toEqual({
      success: false,
    });
    expect(organizationService.createMaxUser).not.toHaveBeenCalled();
  });

  it('recusa convite de equipe, reset de senha e token sem saasName', async () => {
    for (const payload of [
      { id: 'x', saasName: 's', orgId: 'org-1', timeLimit: '2030-01-01' },
      { id: 'user-1', saasName: 's', expires: '2030-01-01' },
      { id: 'ext-1', name: 'Cliente', email: 'c@x.y' },
    ]) {
      await expect(controller.createUser(sign(payload, secret))).resolves.toEqual(
        { success: false }
      );
    }
    expect(organizationService.createMaxUser).not.toHaveBeenCalled();
  });

  it('recusa id/saasName que nao sao string', async () => {
    for (const payload of [
      { id: ['ext-1'], saasName: 's' },
      { id: 'ext-1', saasName: { x: 1 } },
      { id: 1, saasName: 's' },
    ]) {
      await expect(controller.createUser(sign(payload, secret))).resolves.toEqual(
        { success: false }
      );
    }
    expect(organizationService.createMaxUser).not.toHaveBeenCalled();
  });

  it('recusa assinatura de outro segredo', async () => {
    await expect(
      controller.createUser(sign({ id: 'ext-1', saasName: 's' }, 'outro'))
    ).resolves.toEqual({ success: false });
  });

  it('provisiona com o token enterprise legitimo', async () => {
    const token = sign(
      { id: 'ext-1', name: 'Cliente', saasName: 'parceiro', email: 'c@x.y' },
      secret
    );

    await expect(controller.createUser(token)).resolves.toEqual({
      id: 'org-max',
      apiKey: 'k',
    });
    expect(organizationService.createMaxUser).toHaveBeenCalledWith(
      'ext-1',
      'Cliente',
      'parceiro',
      'c@x.y'
    );
  });
});
