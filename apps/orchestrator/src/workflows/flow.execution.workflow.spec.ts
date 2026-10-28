const activities = {
  getFlowWithNodes: jest.fn(),
  replyToComment: jest.fn(),
  sendDirectMessage: jest.fn(),
  sendStoryDirectMessage: jest.fn(),
  checkIgFollowStatus: jest.fn(),
  evaluateCondition: jest.fn(),
  updateExecution: jest.fn(),
  appendExecutionLog: jest.fn(),
  createPendingPostback: jest.fn(),
  sendOpeningDmWithPostback: jest.fn(),
};
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => activities,
  sleep: jest.fn(),
  patched: jest.fn(),
}));
import { patched } from '@temporalio/workflow';
import { flowExecutionWorkflow } from './flow.execution.workflow';
import { stablePrivateMessage } from '@gitroom/nestjs-libraries/database/prisma/flows/private-message-variants';
describe('DM privada versionada', () => {
  const input = {
    executionId: 'e',
    flowId: 'f',
    integrationId: 'i',
    triggerType: 'comment_on_post' as const,
    igCommenterId: 'actor',
    igCommentId: 'c',
    igMediaId: 'p',
  };
  const config = { message: 'antiga', messages: ['Primeira', 'Segunda'] };
  beforeEach(() => {
    jest.clearAllMocks();
    activities.getFlowWithNodes.mockResolvedValue({
      integrationId: 'i',
      organizationId: 'o',
      nodes: [
        { id: 'trigger', type: 'TRIGGER', data: '{}' },
        { id: 'dm', type: 'SEND_DM', data: JSON.stringify(config) },
      ],
      edges: [{ sourceNodeId: 'trigger', targetNodeId: 'dm' }],
    });
  });
  it('replay anterior ignora lista e usa mensagem singular', async () => {
    (patched as jest.Mock).mockReturnValue(false);
    await flowExecutionWorkflow(input);
    expect(activities.sendDirectMessage.mock.calls[0][3]).toBe('antiga');
  });
  it('nova execucao e retry usam mesma alternativa sem consumir sorteio publico', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    const random = jest.spyOn(Math, 'random');
    await flowExecutionWorkflow(input);
    await flowExecutionWorkflow(input);
    expect(
      activities.sendDirectMessage.mock.calls.map((call) => call[3])
    ).toEqual([
      stablePrivateMessage(config, 'e:dm', true),
      stablePrivateMessage(config, 'e:dm', true),
    ]);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
  it('gate congela alternativa antes de criar postback e nao faz envio final', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    const flow = await activities.getFlowWithNodes();
    flow.nodes[0].data = JSON.stringify({ requireFollow: true });
    activities.createPendingPostback.mockResolvedValue({ id: 'pending' });
    await flowExecutionWorkflow(input);
    expect(activities.createPendingPostback).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotFinalDm: stablePrivateMessage(config, 'e:dm', true),
      })
    );
    expect(activities.sendDirectMessage).not.toHaveBeenCalled();
  });
  it('rejeita alternativa expandida alem do limite antes do envio', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    const flow = await activities.getFlowWithNodes();
    flow.nodes[1].data = JSON.stringify({
      messages: ['{comment_text}'],
      buttonText: 'Abrir',
      buttonUrl: 'https://example.com',
    });
    await expect(
      flowExecutionWorkflow({ ...input, commentText: 'x'.repeat(641) })
    ).rejects.toThrow('MESSAGE_TOO_LONG');
    expect(activities.sendDirectMessage).not.toHaveBeenCalled();
    expect(activities.updateExecution).toHaveBeenCalledWith(
      'e',
      expect.objectContaining({ status: 'FAILED' })
    );
  });
});
