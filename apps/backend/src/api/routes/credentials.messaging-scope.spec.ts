import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { CredentialsController } from './credentials.controller';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';

describe('escopo esperado dos tokens Meta', () => {
  let app: INestApplication;
  let base: string;
  let activeProfile: { id: string } | null = { id: 'profile' };
  const credentials = {
    getMessagingTokens: jest.fn().mockResolvedValue({ instagramTokens: [] }),
    updateMessagingTokens: jest.fn(),
  };
  const messaging = {
    validateSystemUserToken: jest.fn(),
    validateIgUserToken: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CredentialsController],
      providers: [
        { provide: CredentialService, useValue: credentials },
        { provide: InstagramMessagingService, useValue: messaging },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: any, _res: unknown, next: () => void) => {
      req.org = { id: 'org' };
      req.profile = activeProfile;
      next();
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    activeProfile = { id: 'profile' };
  });
  function request(
    method: string,
    headers: Record<string, string> = {},
    body: unknown = { instagramTokens: [] }
  ) {
    return fetch(`${base}/credentials/facebook/messaging-tokens`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    });
  }
  it.each(['GET', 'POST'])(
    'rejeita %s de aba com perfil antigo antes de ler ou gravar',
    async (method) => {
      const res = await request(method, {
        'x-expected-org-id': 'org',
        'x-expected-profile-id': 'old-profile',
      });
      expect(res.status).toBe(409);
      expect(credentials.getMessagingTokens).not.toHaveBeenCalled();
      expect(credentials.updateMessagingTokens).not.toHaveBeenCalled();
      expect(messaging.validateIgUserToken).not.toHaveBeenCalled();
    }
  );
  it('rejeita organizacao divergente e escopo incompleto', async () => {
    for (const headers of [
      { 'x-expected-org-id': 'old-org', 'x-expected-profile-id': 'profile' },
      { 'x-expected-profile-id': 'profile' },
    ])
      expect((await request('POST', headers)).status).toBe(409);
    expect(credentials.updateMessagingTokens).not.toHaveBeenCalled();
  });
  it('rejeita tokens novos antes de validar na Meta quando escopo diverge', async () => {
    expect(
      (
        await request(
          'POST',
          {
            'x-expected-org-id': 'org',
            'x-expected-profile-id': 'old-profile',
          },
          {
            metaSystemUserToken: 'system-fixture',
            instagramTokens: [{ igUserId: 'ig', token: 'ig-fixture' }],
          }
        )
      ).status
    ).toBe(409);
    expect(messaging.validateSystemUserToken).not.toHaveBeenCalled();
    expect(messaging.validateIgUserToken).not.toHaveBeenCalled();
    expect(credentials.updateMessagingTokens).not.toHaveBeenCalled();
  });
  it('aceita escopo correspondente e preserva contrato legado sem headers', async () => {
    expect(
      (
        await request('POST', {
          'x-expected-org-id': 'org',
          'x-expected-profile-id': 'profile',
        })
      ).status
    ).toBe(201);
    expect(credentials.updateMessagingTokens).toHaveBeenCalledWith(
      'org',
      'profile',
      { instagramTokens: [] }
    );
    expect((await request('GET')).status).toBe(200);
  });
  it('compara perfil vazio explicitamente sem ignorar a precondicao', async () => {
    const emptyProfile = {
      'x-expected-org-id': 'org',
      'x-expected-profile-id': '',
    };
    expect((await request('POST', emptyProfile)).status).toBe(409);
    expect(credentials.updateMessagingTokens).not.toHaveBeenCalled();
    activeProfile = null;
    expect((await request('POST', emptyProfile)).status).toBe(201);
    expect(credentials.updateMessagingTokens).toHaveBeenCalledWith(
      'org',
      undefined,
      { instagramTokens: [] }
    );
  });
});
