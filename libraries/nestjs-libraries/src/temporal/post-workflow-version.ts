export type PostWorkflowName = 'postWorkflowV102' | 'postWorkflowV112';

type PostWorkflowTarget = { integrationId: string; providerIdentifier: string };
// Argumento legado preservado para consumidores; rollout por canal foi encerrado.
type PostWorkflowGateEnvironment = {
  POST_WORKFLOW_V112_INTEGRATION_IDS?: string;
  POST_WORKFLOW_V112_PROVIDERS?: string;
  POST_WORKFLOW_V112_ALL?: string;
};

export const selectPostWorkflowVersion = (
  _target: PostWorkflowTarget,
  _env?: PostWorkflowGateEnvironment
): PostWorkflowName => 'postWorkflowV112';
