import { createHash } from 'node:crypto';
import type { CopilotRuntime } from '@copilotkit/runtime';
import type { BaseEvent, Message } from '@ag-ui/client';

type Runner = NonNullable<
  NonNullable<ConstructorParameters<typeof CopilotRuntime>[0]>['runner']
>;
type AgentRunnerRunRequest = Parameters<Runner['run']>[0];
type AgentRunnerConnectRequest = Parameters<Runner['connect']>[0];
type AgentRunnerIsRunningRequest = Parameters<Runner['isRunning']>[0];
type AgentRunnerStopRequest = Parameters<Runner['stop']>[0];
interface LocalRunner extends Runner {
  listThreads(): Array<{ id: string }>;
  getThreadMessages(threadId: string): Message[];
  getThreadEvents(threadId: string): BaseEvent[];
  getThreadState(threadId: string): Record<string, unknown> | null;
}
// Public entry point loaded with require because this CommonJS backend uses
// TypeScript's legacy node resolver (it cannot resolve the v2 exports map).
const { InMemoryAgentRunner } = require('@copilotkit/runtime/v2') as {
  InMemoryAgentRunner: new () => LocalRunner;
};

/** The SDK's default store is process-global, even across runner instances. */
export class ScopedCopilotRunner implements Runner {
  readonly ɵsupportsLocalThreadEndpoints = true as const;
  private readonly prefix: string;

  constructor(
    organizationId: string,
    profileId: string | null,
    endpoint: 'chat' | 'agent',
    private readonly delegate = new InMemoryAgentRunner()
  ) {
    if (!organizationId) throw new Error('Authenticated organization required');
    this.prefix =
      createHash('sha256')
        .update(JSON.stringify([endpoint, organizationId, profileId]))
        .digest('hex') + ':';
  }

  private key(threadId: string) {
    return this.prefix + Buffer.from(threadId, 'utf8').toString('base64url');
  }

  run(request: AgentRunnerRunRequest): ReturnType<Runner['run']> {
    // Only the runner's lookup key changes. Mastra and the wire keep the
    // original input.threadId, including old persisted conversation IDs.
    return this.delegate.run({
      ...request,
      threadId: this.key(request.threadId),
    });
  }
  connect(request: AgentRunnerConnectRequest): ReturnType<Runner['connect']> {
    return this.delegate.connect({
      ...request,
      threadId: this.key(request.threadId),
    });
  }
  isRunning(request: AgentRunnerIsRunningRequest) {
    return this.delegate.isRunning({
      ...request,
      threadId: this.key(request.threadId),
    });
  }
  stop(request: AgentRunnerStopRequest) {
    return this.delegate.stop({
      ...request,
      threadId: this.key(request.threadId),
    });
  }
  listThreads() {
    return this.delegate
      .listThreads()
      .filter((thread) => thread.id.startsWith(this.prefix))
      .map((thread) => ({
        ...thread,
        id: Buffer.from(
          thread.id.slice(this.prefix.length),
          'base64url'
        ).toString('utf8'),
      }));
  }
  getThreadMessages(threadId: string) {
    return this.delegate.getThreadMessages(this.key(threadId));
  }
  getThreadEvents(threadId: string) {
    return this.delegate.getThreadEvents(this.key(threadId));
  }
  getThreadState(threadId: string) {
    return this.delegate.getThreadState(this.key(threadId));
  }
  clearThreads(): never {
    // The SDK exposes only a process-wide clear. Never delegate to it.
    throw new Error('Global thread clearing is disabled');
  }
}

/** The fork has its own authenticated conversation UI; new mutations stay closed. */
export function isCopilotThreadMutation(
  body: { method?: string; params?: { httpMethod?: string } } | undefined
): boolean {
  return (
    body?.method === 'threads/clear' ||
    (body?.method === 'resource/request' && body.params?.httpMethod !== 'GET')
  );
}
