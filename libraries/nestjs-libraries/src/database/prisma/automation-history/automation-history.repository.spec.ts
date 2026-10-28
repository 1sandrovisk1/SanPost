import { AutomationHistoryRepository } from './automation-history.repository';
const scope = { organizationId: 'org', profileId: 'profile' };
describe('isolamento e filtros do historico', () => {
  let db: any;
  let repo: AutomationHistoryRepository;
  beforeEach(() => {
    db = {
      flow: { findFirst: jest.fn().mockResolvedValue({ id: 'f' }) },
      flowExecution: { findFirst: jest.fn(), findMany: jest.fn() },
      flowExecutionV2: { findFirst: jest.fn(), findMany: jest.fn() },
    };
    repo = new AutomationHistoryRepository(db);
  });
  it('contexto exige org, perfil, fluxo e versao', async () => {
    await repo.context(scope, 'instagram', 'f');
    expect(db.flow.findFirst.mock.calls[0][0].where).toEqual({
      id: 'f',
      organizationId: 'org',
      profileId: 'profile',
      executionVersion: 1,
      deletedAt: null,
    });
  });
  it('detalhe limita tambem a execucao e sua origem', async () => {
    await repo.detail(scope, 'shared', 'f', 'e');
    expect(db.flowExecutionV2.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'e',
      flowId: 'f',
      organizationId: 'org',
      profileId: 'profile',
      flow: {
        organizationId: 'org',
        profileId: 'profile',
        executionVersion: 2,
        deletedAt: null,
      },
    });
    await repo.detail(scope, 'instagram', 'f', 'e');
    expect(db.flowExecution.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'e',
      flowId: 'f',
      flow: {
        organizationId: 'org',
        profileId: 'profile',
        executionVersion: 1,
      },
    });
  });
  it('aplica filtros e cursor no banco antes de limitar', async () => {
    await repo.list(
      scope,
      'shared',
      'f',
      { limit: 25, status: 'unknown', from: '2026-10-01T00:00:00Z' },
      { at: new Date('2026-10-20T00:00:00Z'), id: 'last' }
    );
    const query = db.flowExecutionV2.findMany.mock.calls[0][0];
    expect(query.take).toBe(26);
    expect(query.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(JSON.stringify(query.where)).toContain('UNKNOWN');
    expect(JSON.stringify(query.where)).toContain('last');
  });
});
