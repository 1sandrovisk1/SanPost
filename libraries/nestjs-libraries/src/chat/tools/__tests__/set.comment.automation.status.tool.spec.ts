jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
import { SetCommentAutomationStatusTool } from '../set.comment.automation.status.tool';
const scope = { organizationId: 'org', profileId: 'perfil' };
const options = { requestContext: { get: (key: string) => ({ organization: '{"id":"org"}', profileId: 'perfil' }[key]) } };
describe('SetCommentAutomationStatusTool', () => {
  const service = { scope: jest.fn().mockResolvedValue(scope), status: jest.fn().mockResolvedValue({ id: 'f', status: 'PAUSED' }) };
  beforeEach(() => jest.clearAllMocks());
  it.each(['ACTIVE','PAUSED','ARCHIVED','DRAFT'])('encaminha status %s sem recriar', async status => { const tool: any = new SetCommentAutomationStatusTool(service as any).run(); await tool.execute({ flowId: 'f', status }, options); expect(service.status).toHaveBeenCalledWith(scope, 'f', 1, status, undefined); });
  it('preserva revisao fornecida em V2 sem consultar/repor pela atual', async () => { const tool: any = new SetCommentAutomationStatusTool(service as any).run(); await tool.execute({ flowId: 'f', executionVersion: 2, status: 'PAUSED', expectedRevision: 4 }, options); expect(service.status).toHaveBeenCalledWith(scope, 'f', 2, 'PAUSED', 4); });
  it('rejeita status invalido sem chamar dominio', async () => { const tool: any = new SetCommentAutomationStatusTool(service as any).run(); const invalid = await tool.execute({ flowId: 'f', status: 'QUALQUER' }, options); expect(invalid.errors || invalid.error).toBeDefined(); expect(service.status).not.toHaveBeenCalled(); });
});
