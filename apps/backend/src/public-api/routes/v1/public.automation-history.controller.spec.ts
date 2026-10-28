jest.mock(
  '@gitroom/nestjs-libraries/integrations/automations/automation-management.service',
  () => ({
    AutomationManagementService: class AutomationManagementService {},
  })
);
import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PublicAutomationsController } from './public.automations.controller';
import { AutomationManagementService } from '@gitroom/nestjs-libraries/integrations/automations/automation-management.service';
describe('historico normalizado na API publica', () => {
  let app: INestApplication, base: string;
  const scope = { organizationId: 'org', profileId: 'escorpiano' };
  const service = {
    scope: jest.fn().mockResolvedValue(scope),
    executionHistory: jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
    executionDetail: jest.fn().mockResolvedValue({ id: 'exec' }),
    history: jest.fn().mockResolvedValue({ legacy: true }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicAutomationsController],
      providers: [{ provide: AutomationManagementService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: any, _res: any, next: () => void) => {
      req.org = { id: 'org' };
      req.publicApiProfileId = 'escorpiano';
      next();
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());
  const get = (path: string) => fetch(`${base}/public/v1/automations/f${path}`);
  it('encaminha filtros tipados e cursor, sem cache e sem confundir detalhe da regra', async () => {
    const r = await get(
      '/history?executionVersion=2&status=unknown&from=2026-10-28T00:00:00Z&limit=7&cursor=cursor'
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ items: [], nextCursor: null });
    expect(service.executionHistory).toHaveBeenCalledWith(scope, 'f', 2, {
      status: 'unknown',
      from: '2026-10-28T00:00:00Z',
      limit: 7,
      cursor: 'cursor',
    });
  });
  it.each([
    'limit=0',
    'limit=51',
    'status=DELIVERED',
    'from=ontem',
    'executionVersion=3',
    'page=2',
    'organizationId=outra',
  ])('recusa query invalida %s', async (q) => {
    expect((await get(`/history?${q}`)).status).toBe(400);
    expect(service.executionHistory).not.toHaveBeenCalled();
  });
  it('protege chave de perfil, detalhe da execucao e versao', async () => {
    expect((await get('/history?profileId=outro')).status).toBe(403);
    expect(service.scope).not.toHaveBeenCalled();
    expect((await get('/history/exec?executionVersion=2')).status).toBe(200);
    expect(service.executionDetail).toHaveBeenCalledWith(scope, 'f', 2, 'exec');
    expect((await get('/history/exec?executionVersion=3')).status).toBe(400);
  });
  it('mantem o formato legado e documenta saidas completas no Swagger', async () => {
    expect(
      await (
        await get('/executions?executionVersion=1&page=2&limit=100')
      ).json()
    ).toEqual({ legacy: true });
    expect(service.history).toHaveBeenCalledWith(scope, 'f', 1, 2, 100);
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build()
    );
    expect(doc.paths).toHaveProperty(
      '/public/v1/automations/{id}/history/{executionId}'
    );
    const schemas = doc.components?.schemas as any;
    expect(schemas.AutomationExecutionDetail.properties).toHaveProperty(
      'steps'
    );
    expect(schemas.AutomationExecutionSummary.properties).toHaveProperty(
      'textTruncated'
    );
  });
});
