const activities = { searchForMissingThreeHoursPosts: jest.fn() };
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
import { missingPostWorkflow } from './missing.post.workflow';

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

describe('missingPostWorkflow - continueAsNew versionado (upstream 185044d5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activities.searchForMissingThreeHoursPosts.mockResolvedValue(undefined);
    (workflowInfo as jest.Mock).mockReturnValue({ historyLength: 10 });
    (continueAsNew as jest.Mock).mockResolvedValue(undefined);
  });

  it('replay da execucao anterior ao patch segue buscando de hora em hora sem reciclar', async () => {
    (patched as jest.Mock).mockReturnValue(false);
    (workflowInfo as jest.Mock).mockReturnValue({ historyLength: 50_000 });
    stopAfterSleeps(30);

    await expect(missingPostWorkflow()).rejects.toBeInstanceOf(StopLoop);

    expect(continueAsNew).not.toHaveBeenCalled();
    // busca inicial + uma por ciclo
    expect(activities.searchForMissingThreeHoursPosts).toHaveBeenCalledTimes(31);
    expect(workflowInfo).not.toHaveBeenCalled();
    expect(patched).toHaveBeenCalledWith('missing-post-continue-as-new');
  });

  it('execucao nova recicla depois de 24 ciclos; a nova execucao busca ao iniciar', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    stopAfterSleeps(100);

    await missingPostWorkflow();

    expect(sleep).toHaveBeenCalledTimes(24);
    // busca inicial + 23 ciclos; o 24o recicla antes de buscar
    expect(activities.searchForMissingThreeHoursPosts).toHaveBeenCalledTimes(24);
    expect(continueAsNew).toHaveBeenCalledTimes(1);
    expect(continueAsNew).toHaveBeenCalledWith();
  });

  it('historico grande (execucao antiga ja ao vivo) recicla no primeiro ciclo', async () => {
    (patched as jest.Mock).mockReturnValue(true);
    (workflowInfo as jest.Mock).mockReturnValue({ historyLength: 1001 });
    stopAfterSleeps(100);

    await missingPostWorkflow();

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(activities.searchForMissingThreeHoursPosts).toHaveBeenCalledTimes(1);
    expect(continueAsNew).toHaveBeenCalledTimes(1);
  });
});
