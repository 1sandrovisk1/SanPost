jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({}));
import { CreateCommentAutomationTool } from '../create.comment.automation.tool';
import { HttpException } from '@nestjs/common';
const scope = { organizationId: 'org', profileId: 'perfil' };
const options = { requestContext: { get: (key: string) => ({ organization: '{"id":"org"}', profileId: 'perfil' }[key]) } };
describe('CreateCommentAutomationTool contrato completo', () => {
  const service = { scope: jest.fn(), create: jest.fn() };
  let tool: any;
  beforeEach(() => { jest.clearAllMocks(); service.scope.mockResolvedValue(scope); service.create.mockResolvedValue({ id: 'f', executionVersion: 1 }); tool = new CreateCommentAutomationTool(service as any).run(); });
  it('mantem id e schema de objeto concreto', () => { expect(tool.id).toBe('createCommentAutomationTool'); expect(tool.inputSchema._def.typeName).toBe('ZodObject'); });
  it('encaminha todos os campos do gate e variacoes sem perde-los', async () => {
    const input = { name: 'Completa', integrationId: 'ig', replyMessages: ['A','B'], matchReactions: false, openingDmMessage: 'Inicio', openingDmButtonText: 'Link', alreadyFollowedButtonText: 'Segui', gateExhaustedMessage: 'Fim', maxGateAttempts: 7, followGateMessage: 'Siga', requireFollow: true };
    expect((await tool.execute(input, options)).output.id).toBe('f');
    expect(service.create).toHaveBeenCalledWith(scope, input);
  });
  it('schema aceita Messenger e prioridade sem traduzir para comentario', async () => {
    const input = { platform: 'facebook', triggerType: 'messenger_message', name: 'Messenger', integrationId: 'fb', keywords: ['quero'], priority: 20, dmMessage: 'Link' };
    await tool.execute(input, options); expect(service.create).toHaveBeenCalledWith(scope, input);
  });
  it('preserva alvo agendado interno e opcao rascunho', async () => {
    const input = { name: 'Alvo', integrationId: 'ig', postMode: 'scheduled', scheduledPostId: 'local-id', activate: false };
    await tool.execute(input, options); expect(service.create).toHaveBeenCalledWith(scope, input);
  });
  it('preserva os aliases declarados', async () => { const input = { name: 'Dark', integrationId: 'ig', postMode: 'specific', aliasMediaIds: ['123'], activate: false }; await tool.execute(input, options); expect(service.create).toHaveBeenCalledWith(scope, input); });
  it('recusa org e perfil forjados sem invocar dominio', async () => { const result = await tool.execute({ name: 'X', integrationId: 'ig', orgId: 'outra', profileId: 'outro' }, options); expect(result.errors || result.error).toBeDefined(); expect(service.create).not.toHaveBeenCalled(); });
  it('nao aceita contexto sem organizacao', async () => { const result = await tool.execute({ name: 'X', integrationId: 'ig' }, { requestContext: { get: (): unknown => undefined } }); expect(result.errors).toContain('ORGANIZATION_REQUIRED'); expect(service.create).not.toHaveBeenCalled(); });
  it('retorna codigo controlado sem vazar erro/token do dominio', async () => { service.create.mockRejectedValue(new Error('token=segredo')); const result = await tool.execute({ name: 'X', integrationId: 'ig' }, options); expect(result.errors).toContain('AUTOMATION_OPERATION_FAILED'); expect(result.errors).not.toContain('segredo'); service.create.mockRejectedValue(new HttpException('PROFILE_KEY_MISMATCH', 403)); expect((await tool.execute({ name: 'X', integrationId: 'ig' }, options)).errors).toContain('PROFILE_KEY_MISMATCH'); });
});
