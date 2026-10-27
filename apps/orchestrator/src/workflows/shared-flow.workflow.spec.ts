const activity = { sharedStart: jest.fn(), sharedDeliver: jest.fn(), sharedFinish: jest.fn() };
jest.mock('@temporalio/workflow', () => ({ proxyActivities: () => activity, sleep: jest.fn(), startChild: jest.fn(), continueAsNew: jest.fn(), ParentClosePolicy: { ABANDON: 2 } }));
import { flowExecutionV2Workflow } from './shared-flow.workflow';
import { sleep } from '@temporalio/workflow';
describe('execucao compartilhada duravel', () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it('para no resultado incerto sem executar a proxima acao', async () => {
    activity.sharedStart.mockResolvedValue([{ key: 'private_reply', delaySeconds: 0 }, { key: 'public', delaySeconds: 10 }]);
    activity.sharedDeliver.mockResolvedValue('UNKNOWN');
    await flowExecutionV2Workflow('execution');
    expect(activity.sharedDeliver).toHaveBeenCalledTimes(1);
    expect(activity.sharedFinish).toHaveBeenCalledWith('execution', 'UNKNOWN', 'UNKNOWN');
    expect(sleep).not.toHaveBeenCalled();
  });
  it('cancela antes de qualquer efeito quando pausado', async () => {
    activity.sharedStart.mockResolvedValue(null);
    await flowExecutionV2Workflow('execution');
    expect(activity.sharedDeliver).not.toHaveBeenCalled();
    expect(activity.sharedFinish).toHaveBeenCalledWith('execution', 'CANCELLED');
  });
  it('espera somente diferenca acumulada e finaliza', async () => {
    activity.sharedStart.mockResolvedValue([{ key: 'public', delaySeconds: 5 }, { key: 'private_reply', delaySeconds: 12 }]);
    activity.sharedDeliver.mockResolvedValue('SENT');
    await flowExecutionV2Workflow('execution');
    expect((sleep as jest.Mock).mock.calls).toEqual([[5000], [7000]]);
    expect(activity.sharedFinish).toHaveBeenCalledWith('execution', 'COMPLETED');
  });
});
