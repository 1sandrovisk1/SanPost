const batch = jest.fn();
const pause = jest.fn();
const restart = jest.fn();
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: () => ({ migratePostWorkflowBatch: batch }),
  sleep: (...args: unknown[]) => pause(...args),
  continueAsNew: (...args: unknown[]) => restart(...args),
}));
import { migratePostWorkflowsV112 } from './migrate-post-workflows-v112.workflow';

describe('migratePostWorkflowsV112', () => {
  beforeEach(() => jest.clearAllMocks());
  it('pagina e recicla imediatamente para continuar lote sem perder cursor', async () => {
    batch.mockResolvedValue({ nextCursor: 'p50' });
    await migratePostWorkflowsV112({ cursor: 'p0' });
    expect(batch).toHaveBeenCalledWith('p0');
    expect(restart).toHaveBeenCalledWith({ cursor: 'p50' });
    expect(pause).not.toHaveBeenCalled();
  });
  it('encerra varredura e agenda outra sem crescer historico', async () => {
    batch.mockResolvedValue({});
    await migratePostWorkflowsV112({});
    expect(pause).toHaveBeenCalledWith('5 minutes');
    expect(restart).toHaveBeenCalledWith({});
  });
  it('indisponibilidade conserva cursor e nao encerra singleton', async () => {
    batch.mockRejectedValue(new Error('infra'));
    await migratePostWorkflowsV112({ cursor: 'p0' });
    expect(pause).toHaveBeenCalledWith('5 minutes');
    expect(restart).toHaveBeenCalledWith({ cursor: 'p0' });
  });
});
