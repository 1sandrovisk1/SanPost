import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AutomationHistoryController } from './automation-history.controller';
import { AutomationHistoryService } from '@gitroom/nestjs-libraries/database/prisma/automation-history/automation-history.service';
describe('contrato autenticado do historico', () => {
  let app: INestApplication;
  let base: string;
  const service = {
    list: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    detail: jest.fn().mockResolvedValue({ id: 'e' }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AutomationHistoryController],
      providers: [{ provide: AutomationHistoryService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: any, _res: unknown, next: () => void) => {
      req.org = { id: 'org' };
      req.profile = { id: 'profile' };
      next();
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());
  it('valida query sem aceitar perfil do cliente e delega escopo autenticado', async () => {
    const response = await fetch(
      `${base}/automation-history/shared/f?limit=10&status=failed`
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(service.list).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile' },
      'shared',
      'f',
      expect.objectContaining({ limit: 10, status: 'failed' })
    );
    service.list.mockClear();
    for (const query of [
      'limit=51',
      'limit=0',
      'limit=no',
      'status=other',
      'from=invalid',
      'profileId=other',
    ])
      expect(
        (await fetch(`${base}/automation-history/shared/f?${query}`)).status
      ).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });
  it('detalhe inclui fluxo e execucao e recusa motor desconhecido', async () => {
    expect(
      (await fetch(`${base}/automation-history/instagram/f/e`)).status
    ).toBe(200);
    expect(service.detail).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile' },
      'instagram',
      'f',
      'e'
    );
    expect((await fetch(`${base}/automation-history/other/f/e`)).status).toBe(
      400
    );
  });
});
