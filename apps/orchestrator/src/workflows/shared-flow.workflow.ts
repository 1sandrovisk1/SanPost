import {
  proxyActivities,
  sleep,
  startChild,
  continueAsNew,
  ParentClosePolicy,
} from '@temporalio/workflow';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/common';
import type { SharedFlowActivity } from '../activities/shared-flow.activity';
const activity = proxyActivities<SharedFlowActivity>({
  startToCloseTimeout: '2 minutes',
  retry: { initialInterval: '2 seconds', maximumInterval: '1 minute' },
  taskQueue: 'main',
});
export async function flowExecutionV2Workflow(id: string) {
  const actions = await activity.sharedStart(id);
  if (!actions) {
    await activity.sharedFinish(id, 'CANCELLED');
    return;
  }
  let elapsed = 0;
  for (const action of actions) {
    if (action.delaySeconds > elapsed)
      await sleep((action.delaySeconds - elapsed) * 1000);
    elapsed = action.delaySeconds;
    const result = await activity.sharedDeliver(id, action.key);
    if (result !== 'SENT') {
      await activity.sharedFinish(
        id,
        result === 'CANCELLED'
          ? 'CANCELLED'
          : result === 'UNKNOWN'
          ? 'UNKNOWN'
          : 'FAILED',
        result
      );
      return;
    }
  }
  await activity.sharedFinish(id, 'COMPLETED');
}
export async function automationDispatchWorkflow() {
  for (let cycle = 0; cycle < 100; cycle++) {
    const pending = await activity.sharedPendingDispatches();
    for (const item of pending) {
      try {
        await startChild(flowExecutionV2Workflow, {
          workflowId: `comment-flow-v2-${item.executionId}`,
          args: [item.executionId],
          taskQueue: 'main',
          parentClosePolicy: ParentClosePolicy.ABANDON,
          workflowIdReusePolicy: 'REJECT_DUPLICATE',
        });
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError))
          throw error;
      }
      await activity.sharedDispatched(item.id);
    }
    await sleep('5 seconds');
  }
  await continueAsNew<typeof automationDispatchWorkflow>();
}
