import 'reflect-metadata';
import {
  Controller,
  Get,
  Post,
  Put,
  INestApplication,
  UseGuards,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import {
  REAL_IP_GLOBAL_CEILING_FACTOR,
  ThrottlerBehindProxyGuard,
  ThrottlerRealIpGuard,
} from './throttler.provider';

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
  @Get('/public/v1/automations/:id/history') history() {
    return {};
  }
  @Get('/public/v1/automations/:id/history/:executionId') executionDetail() {
    return {};
  }
  @Get('/automation-history/:engine/:id') privateHistory() {
    return {};
  }
  @Get('/automation-history/:engine/:id/:executionId')
  privateExecutionDetail() {
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
    ['/public/v1/automations/id/history', 'GET'],
    ['/PUBLIC/v1/AUTOMATIONS/id/HISTORY/exec/', 'GET'],
    ['/automation-history/instagram/id/', 'GET'],
    ['/AUTOMATION-HISTORY/shared/id/exec', 'GET'],
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
    '/public/v1/automations/id/history',
    '/public/v1/automations/id/history/exec',
    '/automation-history/instagram/id',
    '/automation-history/shared/id/exec',
  ])('HEAD e GET compartilham o limite do historico em %s', async (path) => {
    const org = 'head-' + path;
    expect(await request(path, 'HEAD', org)).toBe(200);
    expect(await request(path.toUpperCase() + '/', 'GET', org)).toBe(429);
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

@Controller()
class PublicRoutes {
  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Post('/auth/farcaster/signer')
  signer() {
    return {};
  }

  @UseGuards(ThrottlerRealIpGuard)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  @Get('/auth/farcaster/signer')
  status() {
    return {};
  }
}

// upstream #2078: rotas publicas do Farcaster limitadas por cliente (IP que o
// proxy repassa) + teto global do fork, ja que o x-forwarded-for e forjavel
describe('ThrottlerRealIpGuard', () => {
  let app: INestApplication;
  let url: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [PublicRoutes],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard }],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  const request = async (forwardedFor: string, method = 'POST') => {
    const response = await fetch(url + '/auth/farcaster/signer', {
      method,
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    });
    await response.text();
    return response.status;
  };

  it('limita cada cliente pelo primeiro IP do x-forwarded-for', async () => {
    expect(await request('203.0.113.1, 10.0.0.2')).toBe(201);
    expect(await request('203.0.113.1, 10.0.0.3')).toBe(429);
    expect(await request('203.0.113.2, 10.0.0.2')).toBe(201);
  });

  it('teto global por rota segura quem troca o x-forwarded-for a cada chamada', async () => {
    // GET tem contador proprio (outro handler)
    const statuses: number[] = [];
    for (let i = 0; i <= REAL_IP_GLOBAL_CEILING_FACTOR; i++) {
      statuses.push(await request(`198.51.100.${i}`, 'GET'));
    }
    expect(statuses.slice(0, REAL_IP_GLOBAL_CEILING_FACTOR)).toEqual(
      Array(REAL_IP_GLOBAL_CEILING_FACTOR).fill(200)
    );
    expect(statuses[REAL_IP_GLOBAL_CEILING_FACTOR]).toBe(429);
  });
});
