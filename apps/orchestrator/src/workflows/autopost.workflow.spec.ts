const activities = { autoPost: jest.fn() };
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => activities,
  sleep: jest.fn(),
  patched: jest.fn(),
  workflowInfo: jest.fn(),
  continueAsNew: jest.fn(),
}));
import {
  continueAsNew,
  patched,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import { autoPostWorkflow } from './autopost.workflow';

// O loop e infinito: o mock do sleep interrompe o workflow depois de N ciclos.
class StopLoop extends Error {}
const stopAfterSleeps = (cycles: number) => {
  let count = 0;
  (sleep as jest.Mock).mockImplementation(async () => {
    count++;
    if (count > cycles) {
      throw new StopLoop();
    }
  });
};

describe('autoPostWorkflow - continueAsNew versionado (upstream 185044d5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activities.autoPost.mockResolvedValue(undefined);
    (workflowInfo as jest.Mock).mockReturnValue({ historyLength: 10 });
    (continueAsNew as jest.Mock).mockResolvedValue(undefined);
  });

  it('replay de execucao anterior ao patch segue o loop antigo sem reciclar', async () => {
    (patched as jest.Mock).mockReturnValue(false);
    (workflowInfo as jest.Mock).mockReturnValue({ historyLength: 50_000 });
    stopAfterSleeps(30);

    await expect(
      autoPostWorkflow({ id: 'auto-1', immediately: true })
    ).rejects.toBeInstanceOf(StopLoop);

    expect(continueAsNew).not.toHaveBeenCalled();
    expect(activities.autoPost).toHaveBeenCalledTimes(31);
    // o historico nem e consultado fora do patch
    expect(workflowInfo).not.toHaveBeenCalled();
    expect(patched).toHaveBeenCalledWith('autopost-continue-as-new');
  });

  it('execucao nova recicla depois de 24 ciclos mantendo o id e rodando logo', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    stopAfterSleeps(100);

    await autoPostWorkflow({ id: 'auto-1', immediately: false });

    expect(sleep).toHaveBeenCalledTimes(24);
    // o primeiro ciclo respeita immediately=false; os 23 seguintes publicam
    expect(activities.autoPost).toHaveBeenCalledTimes(23);
    expect(continueAsNew).toHaveBeenCalledTimes(1);
    expect(continueAsNew).toHaveBeenCalledWith({
      id: 'auto-1',
      immediately: true,
    });
  });

  it('historico grande (execucao antiga ja ao vivo) recicla no primeiro ciclo', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    (workflowInfo as jest.Mock).mockReturnValue({ historyLength: 1001 });
    stopAfterSleeps(100);

    await autoPostWorkflow({ id: 'auto-1', immediately: true });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(activities.autoPost).toHaveBeenCalledTimes(1);
    expect(continueAsNew).toHaveBeenCalledWith({
      id: 'auto-1',
      immediately: true,
    });
  });

  it('falha do autoPost nao impede a reciclagem e o continueAsNew nao e engolido', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    (workflowInfo as jest.Mock).mockReturnValue({ historyLength: 5000 });
    activities.autoPost.mockRejectedValue(new Error('feed fora do ar'));
    const continueSignal = new Error('ContinueAsNew');
    (continueAsNew as jest.Mock).mockRejectedValue(continueSignal);
    stopAfterSleeps(100);

    await expect(
      autoPostWorkflow({ id: 'auto-1', immediately: true })
    ).rejects.toBe(continueSignal);
    expect(activities.autoPost).toHaveBeenCalledTimes(1);
  });
});
