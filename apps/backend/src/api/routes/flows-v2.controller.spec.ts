import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FlowsV2Controller } from './flows-v2.controller';
import { SharedFlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/shared-flows.service';
describe('contrato HTTP do criador compartilhado', () => {
  let app: INestApplication;
  let base: string;
  const service = {
    save: jest.fn().mockResolvedValue({ id: 'flow', revision: 1 }),
    status: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    readiness: jest.fn().mockResolvedValue({ ready: true }),
    activateMessenger: jest.fn().mockResolvedValue({ ready: true }),
    resolvePost: jest.fn().mockResolvedValue({ post: { id: '123_456' } }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FlowsV2Controller],
      providers: [{ provide: SharedFlowsService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: any, _res: unknown, next: () => void) => {
      req.org = { id: 'org' };
      req.profile = { id: 'profile' };
      next();
    });
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    );
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());
  async function post(path: string, value: unknown) {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  }
  it('consulta publicacao usando escopo autenticado e DTO limitado sem cache', async () => {
    const response = await post('/flows-v2/channels/page/resolve-post', {
      reference: '123_456',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ post: { id: '123_456' } });
    expect(service.resolvePost).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile' },
      'page',
      '123_456'
    );
    service.resolvePost.mockClear();
    for (const input of [
      {},
      { reference: '' },
      { reference: 123 },
      { reference: 'x'.repeat(2049) },
      { reference: '123_456', profileId: 'other' },
    ]) {
      expect(
        (await post('/flows-v2/channels/page/resolve-post', input)).status
      ).toBe(400);
    }
    expect(service.resolvePost).not.toHaveBeenCalled();
  });
  it('aplica validacao estrita local com o mesmo pipe global do runtime', async () => {
    const module = await Test.createTestingModule({
      controllers: [FlowsV2Controller],
      providers: [{ provide: SharedFlowsService, useValue: service }],
    }).compile();
    const runtimeApp = module.createNestApplication({ logger: false });
    runtimeApp.use((req: any, _res: unknown, next: () => void) => {
      req.org = { id: 'org' };
      req.profile = { id: 'profile' };
      next();
    });
    runtimeApp.useGlobalPipes(new ValidationPipe({ transform: true }));
    try {
      await runtimeApp.listen(0, '127.0.0.1');
      const response = await fetch(
        `${await runtimeApp.getUrl()}/flows-v2/channels/page/resolve-post`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: '123_456', profileId: 'other' }),
        }
      );
      expect(response.status).toBe(400);
      expect(service.resolvePost).not.toHaveBeenCalled();
    } finally {
      await runtimeApp.close();
    }
  });
  it('separa consulta de readiness da ativacao explicita do Messenger no perfil', async () => {
    expect(
      (
        await fetch(
          `${base}/flows-v2/channels/page/readiness?triggerType=messenger_message`
        )
      ).status
    ).toBe(200);
    expect(service.readiness).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile' },
      'page',
      'messenger_message'
    );
    expect(service.activateMessenger).not.toHaveBeenCalled();
    expect(
      (await post('/flows-v2/channels/page/activate-messenger', {})).status
    ).toBe(201);
    expect(service.activateMessenger).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile' },
      'page'
    );
  });
  it('usa perfil autenticado e rejeita tentativa de alterar escopo no corpo', async () => {
    const input = {
      name: 'Teste',
      channels: [
        { integrationId: 'page', postMode: 'specific', postIds: ['123_456'] },
      ],
      definition: { nodes: [] as unknown[], edges: [] as unknown[] },
    };
    expect(
      (await post('/flows-v2', { ...input, profileId: 'other' })).status
    ).toBe(400);
    expect(service.save).not.toHaveBeenCalled();
    expect((await post('/flows-v2', input)).status).toBe(201);
    expect(service.save.mock.calls[0][0]).toEqual({
      organizationId: 'org',
      profileId: 'profile',
    });
  });
  it('exige revisao na ativacao e valida canais aninhados', async () => {
    expect(
      (await post('/flows-v2/flow/status', { status: 'ACTIVE' })).status
    ).toBe(400);
    expect(service.status).not.toHaveBeenCalled();
    expect(
      (
        await post('/flows-v2', {
          name: 'Teste',
          channels: [
            { integrationId: 'page', postMode: 'unknown', postIds: [] },
          ],
          definition: {},
        })
      ).status
    ).toBe(400);
    expect(service.save).not.toHaveBeenCalled();
  });
});
