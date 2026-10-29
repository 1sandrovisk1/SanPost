import { InfiniteWorkflowRegister } from './infinite.workflow.register';

describe('InfiniteWorkflowRegister', () => {
  const oldCron = process.env.RUN_CRON;
  afterEach(() => { if (oldCron === undefined) delete process.env.RUN_CRON; else process.env.RUN_CRON = oldCron; });
  it('espera bootstrap e reconcilia singleton sem duplicar', async () => {
    process.env.RUN_CRON = 'true';
    const start = jest.fn().mockResolvedValue({});
    const register = new InfiniteWorkflowRegister({client: {getRawClient: () => ({workflow: {start}})}} as any);
    expect((register as any).onModuleInit).toBeUndefined();
    await (register as any).onApplicationBootstrap();
    expect(start).toHaveBeenCalledWith('missingPostWorkflow', expect.objectContaining({workflowId: 'missing-post-workflow', taskQueue: 'main', workflowIdConflictPolicy: 'USE_EXISTING'}));
  });
  it('nao inicia cron desabilitado', async () => {
    delete process.env.RUN_CRON;
    const start = jest.fn();
    const register = new InfiniteWorkflowRegister({client: {getRawClient: () => ({workflow: {start}})}} as any);
    await (register as any).onApplicationBootstrap();
    expect(start).not.toHaveBeenCalled();
  });
});
