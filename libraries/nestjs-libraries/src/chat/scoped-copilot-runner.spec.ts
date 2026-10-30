jest.mock('@copilotkit/runtime/v2', () => ({
  AgentRunner: class {},
  InMemoryAgentRunner: jest.fn(),
}));
import { ScopedCopilotRunner } from './scoped-copilot-runner';

describe('runner Copilot isolado', () => {
  const fake = () => ({
    run: jest.fn((_request: any) => undefined),
    connect: jest.fn((_request: any) => undefined),
    stop: jest.fn((_request: any) => undefined),
    isRunning: jest.fn((_request: any) => undefined),
    listThreads: jest.fn(() => []),
    getThreadMessages: jest.fn((_id: string) => undefined),
    getThreadEvents: jest.fn((_id: string) => undefined),
    getThreadState: jest.fn((_id: string) => undefined),
    clearThreads: jest.fn(),
  });
  it('isola run/connect/stop/isRunning inclusive com ID alheio conhecido', () => {
    const base = fake();
    const a = new ScopedCopilotRunner('orgA', 'profile', 'agent', base as any);
    const b = new ScopedCopilotRunner('orgB', 'profile', 'agent', base as any);
    const input = { threadId: 'same', runId: 'run' };
    a.run({ threadId: 'same', input } as any);
    const keyA = base.run.mock.calls[0][0].threadId;
    expect(base.run.mock.calls[0][0].input).toBe(input);
    b.connect({ threadId: keyA });
    b.stop({ threadId: keyA, runId: 'exact-run' });
    expect(base.stop.mock.calls[0][0].runId).toBe('exact-run');
    b.isRunning({ threadId: keyA });
    for (const fn of [base.connect, base.stop, base.isRunning])
      expect(fn.mock.calls[0][0].threadId).not.toBe(keyA);
  });
  it('filtra listagem e escopa todas as leituras sem mudar ID publico', () => {
    const base = fake();
    const a = new ScopedCopilotRunner('org', 'profileA', 'agent', base as any);
    const b = new ScopedCopilotRunner('org', 'profileB', 'agent', base as any);
    a.run({ threadId: 'same', input: { threadId: 'same' } } as any);
    const keyA = base.run.mock.calls[0][0].threadId;
    b.run({ threadId: 'same', input: { threadId: 'same' } } as any);
    const keyB = base.run.mock.calls[1][0].threadId;
    base.listThreads.mockReturnValue([{ id: keyA }, { id: keyB }] as any);
    expect(a.listThreads()).toEqual([{ id: 'same' }]);
    b.getThreadMessages(keyA);
    b.getThreadEvents(keyA);
    b.getThreadState(keyA);
    for (const fn of [
      base.getThreadMessages,
      base.getThreadEvents,
      base.getThreadState,
    ])
      expect(fn.mock.calls[0][0]).not.toBe(keyA);
    expect(() => a.clearThreads()).toThrow();
    expect(base.clearThreads).not.toHaveBeenCalled();
  });
  it('separa chat de agent e recusa organizacao ausente', () => {
    const base = fake();
    for (const endpoint of ['chat', 'agent'] as const)
      new ScopedCopilotRunner('org', null, endpoint, base as any).run({
        threadId: 'same',
      } as any);
    expect(base.run.mock.calls[0][0].threadId).not.toBe(
      base.run.mock.calls[1][0].threadId
    );
    expect(
      () => new ScopedCopilotRunner('', null, 'agent', base as any)
    ).toThrow();
  });

  it('retoma a mesma conversa entre requisicoes do mesmo perfil', () => {
    const base = fake();
    const first = new ScopedCopilotRunner(
      'org',
      'profile',
      'agent',
      base as any
    );
    const next = new ScopedCopilotRunner(
      'org',
      'profile',
      'agent',
      base as any
    );
    const threadId = 'conversa/acao:東京';

    first.run({ threadId, input: { threadId } } as any);
    const storedId = base.run.mock.calls[0][0].threadId;
    base.listThreads.mockReturnValue([{ id: storedId }] as any);

    expect(next.listThreads()).toEqual([{ id: threadId }]);
    next.connect({ threadId });
    next.isRunning({ threadId });
    next.stop({ threadId, runId: 'run' });
    for (const fn of [base.connect, base.isRunning, base.stop])
      expect(fn.mock.calls[0][0].threadId).toBe(storedId);

    next.getThreadMessages(threadId);
    next.getThreadEvents(threadId);
    next.getThreadState(threadId);
    for (const fn of [
      base.getThreadMessages,
      base.getThreadEvents,
      base.getThreadState,
    ])
      expect(fn).toHaveBeenCalledWith(storedId);
  });
});
