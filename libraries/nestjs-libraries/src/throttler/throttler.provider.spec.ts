import 'reflect-metadata';
import { Controller, Get, Post, Put, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerBehindProxyGuard } from './throttler.provider';

@Controller()
@Throttle({ default: { limit: 1, ttl: 60_000 } })
class Routes {
  @Post('/public/v1/automations') create() {
    return {};
  }
  @Put('/public/v1/post-management/:id') update() {
    return {};
  }
  @Get('/public/v1/automations/options') options() {
    return {};
  }
  @Get('/public/v1/automations/capabilities') capabilities() {
    return {};
  }
  @Get('/flows-v2/channels/:id/readiness') readiness() {
    return {};
  }
  @Get('/flows/integrations/:id/webhook-status') webhookStatus() {
    return {};
  }
  @Post('/flows/quick-create') quick() {
    return {};
  }
  @Post('/public/v1/posts') post() {
    return {};
  }
  @Post('/public/facebook-automations/:app') webhook() {
    return {};
  }
}
describe('limites HTTP das automacoes', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1 }])],
      controllers: [Routes],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.org = { id: req.headers['x-fixture-org'] || 'fixture-org' };
      next();
    });
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  const request = async (path: string, method = 'GET', org = 'fixture-org') => {
    const response = await fetch(url + path, {
      method,
      headers: { 'x-fixture-org': org },
    });
    await response.text();
    return response.status;
  };
  it.each([
    ['/public/v1/automations', 'POST'],
    ['/public/v1/post-management/id', 'PUT'],
    ['/public/v1/automations/options?resource=posts', 'GET'],
    ['/flows/integrations/id/webhook-status', 'GET'],
    ['/flows-v2/channels/id/readiness/', 'GET'],
    ['/FLOWS-V2/channels/id/readiness', 'GET'],
    ['/public/v1/automations/options/?resource=posts', 'GET'],
    ['/flows-v2/channels/id/readiness', 'GET'],
    ['/flows/quick-create', 'POST'],
    ['/public/v1/posts', 'POST'],
  ])('aplica 429 e isola organizacoes em %s', async (path, method) => {
    const org = 'org-' + path;
    expect(await request(path, method, org)).toBe(
      method === 'POST' ? 201 : 200
    );
    expect(await request(path, method, org)).toBe(429);
    expect(await request(path, method, org + '-other')).toBe(
      method === 'POST' ? 201 : 200
    );
  });
  it.each([
    '/public/v1/automations/capabilities',
    '/public/v1/automations/options?resource=integrations',
  ])('nao limita leituras locais %s', async (path) => {
    expect(await request(path)).toBe(200);
    expect(await request(path)).toBe(200);
  });
  it('mantem o mesmo orcamento ao alternar caixa e query sem efeito', async () => {
    expect(await request('/public/v1/posts', 'POST', 'case-fixture')).toBe(201);
    expect(await request('/public/v1/POSTS', 'POST', 'case-fixture')).toBe(429);
    expect(
      await request('/public/v1/automations', 'POST', 'query-fixture')
    ).toBe(201);
    expect(
      await request(
        '/public/v1/automations?unused=/posts',
        'POST',
        'query-fixture'
      )
    ).toBe(429);
  });
  it('nao captura webhook publico da Meta', async () => {
    expect(await request('/public/facebook-automations/app', 'POST')).toBe(201);
    expect(await request('/public/facebook-automations/app', 'POST')).toBe(201);
  });
});
