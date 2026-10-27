import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { FacebookSystemUserService } from './facebook-system-user.service';
import { FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS } from './facebook-comment-automation.adapter';
import { MetaAutomationError } from './meta-automation-graph.client';

describe('autorizacao Facebook por usuario de sistema', () => {
  const scope = { organizationId: 'org', profileId: 'profile' };
  const app = { client_id: '456', client_secret: 'APP_SECRET' };
  let credentials: any;
  let graph: any;
  let debug: any;
  let service: FacebookSystemUserService;
  beforeEach(() => {
    credentials = {
      getRaw: jest
        .fn()
        .mockResolvedValue({ metaSystemUserToken: 'SYSTEM_SECRET' }),
    };
    debug = {
      is_valid: true,
      type: 'SYSTEM_USER',
      app_id: '456',
      user_id: '789',
      expires_at: 0,
      data_access_expires_at: 0,
      scopes: [
        ...FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS,
        'pages_manage_engagement',
      ],
    };
    graph = {
      read: jest.fn(async (path: string) =>
        path === 'debug_token'
          ? { data: debug }
          : { id: '123', access_token: 'PAGE_SECRET' }
      ),
    };
    service = new FacebookSystemUserService(credentials, graph);
  });
  it('deriva somente o token da pagina selecionada com credencial do perfil exato', async () => {
    const result = await service.derive(scope, '123', app);
    expect(credentials.getRaw).toHaveBeenCalledWith(
      'org',
      'facebook',
      'profile'
    );
    expect(graph.read.mock.calls).toEqual([
      ['debug_token', '456|APP_SECRET', { input_token: 'SYSTEM_SECRET' }],
      ['123', 'SYSTEM_SECRET', { fields: 'id,access_token' }],
    ]);
    expect(result.pageToken).toBe('PAGE_SECRET');
    expect(result.authorization).toMatchObject({
      source: 'SYSTEM_USER',
      systemUserId: '789',
      noScheduledExpiry: true,
      tokenExpiresAt: null,
    });
    expect(JSON.stringify(result.authorization)).not.toContain('SECRET');
    expect(result.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('SYSTEM_SECRET');
  });
  it('exige resposta publica para nao enfraquecer automacoes existentes', async () => {
    debug.scopes = [...FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS];
    await expect(service.derive(scope, '123', app)).rejects.toMatchObject({
      status: 412,
    });
    expect(graph.read).toHaveBeenCalledTimes(1);
  });
  it('traduz divergencia de app no debug antes de derivar o token da pagina', async () => {
    graph.read.mockRejectedValue(
      new MetaAutomationError('APP_MISMATCH', 100, undefined, 400)
    );
    await expect(service.derive(scope, '123', app)).rejects.toMatchObject({
      status: 412,
      response: { message: 'SYSTEM_USER_APP_MISMATCH' },
    });
    expect(graph.read).toHaveBeenCalledTimes(1);
  });
  it.each([
    new MetaAutomationError('META_REJECTED', 100, undefined, 400),
    { category: 'APP_MISMATCH', message: 'SYSTEM_SECRET' },
  ])('nao transforma outro erro em divergencia de aplicativo', async error => {
    graph.read.mockRejectedValue(error);
    await expect(service.derive(scope, '123', app)).rejects.toMatchObject({
      status: 412,
      response: { message: 'SYSTEM_USER_CHECK_FAILED' },
    });
    expect(graph.read).toHaveBeenCalledTimes(1);
  });
  it('preserva vencimentos reais e nao inventa prazo lifetime', async () => {
    debug.expires_at = Math.floor(Date.now() / 1000) + 3600;
    debug.data_access_expires_at = debug.expires_at + 3600;
    const result = await service.derive(scope, '123', app);
    expect(result.authorization).toMatchObject({
      noScheduledExpiry: false,
      tokenExpiresAt: new Date(debug.expires_at * 1000).toISOString(),
      dataAccessExpiresAt: new Date(
        debug.data_access_expires_at * 1000
      ).toISOString(),
    });
  });
  it.each([
    ['is_valid', false, 'SYSTEM_USER_TOKEN_INVALID'],
    ['type', 'USER', 'SYSTEM_USER_TYPE_REQUIRED'],
    ['type', 'PAGE', 'SYSTEM_USER_TYPE_REQUIRED'],
    ['app_id', '999', 'SYSTEM_USER_APP_MISMATCH'],
    ['user_id', undefined, 'SYSTEM_USER_TOKEN_INVALID'],
    ['expires_at', undefined, 'SYSTEM_USER_EXPIRY_UNKNOWN'],
    ['expires_at', -1, 'SYSTEM_USER_TOKEN_INVALID'],
    ['expires_at', 1, 'SYSTEM_USER_TOKEN_EXPIRED'],
    ['data_access_expires_at', 1, 'SYSTEM_USER_TOKEN_EXPIRED'],
    ['scopes', [], 'SYSTEM_USER_PERMISSIONS_MISSING'],
  ])(
    'rejeita %s invalido antes de consultar a pagina',
    async (key, value, reason) => {
      debug[key as string] = value;
      await expect(service.derive(scope, '123', app)).rejects.toMatchObject({
        response: expect.objectContaining({ message: reason }),
        status: 412,
      });
      expect(graph.read).toHaveBeenCalledTimes(1);
    }
  );
  it('nao transforma prazo de dados ausente em ausencia de vencimento', async () => {
    delete debug.data_access_expires_at;
    expect(
      (await service.derive(scope, '123', app)).authorization
        .dataAccessExpiresAt
    ).toBeUndefined();
  });
  it('falha sem token local mesmo com token no ambiente', async () => {
    const previous = process.env.META_SYSTEM_USER_TOKEN;
    process.env.META_SYSTEM_USER_TOKEN = 'FOREIGN';
    credentials.getRaw.mockResolvedValue(null);
    try {
      expect(await service.available(scope)).toBe(false);
      await expect(service.derive(scope, '123', app)).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'SYSTEM_USER_TOKEN_REQUIRED',
        }),
      });
      expect(graph.read).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.META_SYSTEM_USER_TOKEN;
      else process.env.META_SYSTEM_USER_TOKEN = previous;
    }
  });
  it.each(['organizationId', 'profileId'])(
    'exige %s sem consultar credenciais',
    async (key) => {
      await expect(
        service.available({ ...scope, [key]: '' })
      ).rejects.toMatchObject({ status: 403 });
      expect(credentials.getRaw).not.toHaveBeenCalled();
    }
  );
  it('rejeita concessao granular de outra pagina', async () => {
    debug.granular_scopes = [{ scope: 'pages_messaging', target_ids: ['999'] }];
    await expect(service.derive(scope, '123', app)).rejects.toMatchObject({
      response: expect.objectContaining({ message: 'SYSTEM_USER_PAGE_DENIED' }),
    });
  });
  it.each([{ id: '999', access_token: 'FOREIGN' }, { id: '123' }])(
    'rejeita derivacao divergente ou sem token',
    async (value) => {
      graph.read.mockImplementation(async (path: string) =>
        path === 'debug_token' ? { data: debug } : value
      );
      await expect(service.derive(scope, '123', app)).rejects.toMatchObject({
        response: expect.objectContaining({
          message: 'SYSTEM_USER_PAGE_DENIED',
        }),
      });
    }
  );
  it('detecta troca ou remocao da credencial durante a derivacao', async () => {
    const result = await service.derive(scope, '123', app);
    await expect(
      service.assertUnchanged(scope, app, result.sourceFingerprint)
    ).resolves.toBeUndefined();
    credentials.getRaw.mockResolvedValue({ metaSystemUserToken: 'REPLACED' });
    await expect(
      service.assertUnchanged(scope, app, result.sourceFingerprint)
    ).rejects.toMatchObject({ status: 409 });
    credentials.getRaw.mockResolvedValue(null);
    await expect(
      service.assertUnchanged(scope, app, result.sourceFingerprint)
    ).rejects.toMatchObject({ status: 409 });
  });
  it.each([
    new Error('SYSTEM_SECRET APP_SECRET'),
    new HttpException('SYSTEM_SECRET APP_SECRET', 400),
  ])('nao propaga erros com segredos ou corpo da Meta', async (failure) => {
    graph.read.mockRejectedValue(failure);
    try {
      await service.derive(scope, '123', app);
      throw new Error('expected rejection');
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('SECRET');
      expect(error).toMatchObject({ status: 412 });
    }
  });
});
