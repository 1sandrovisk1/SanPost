'use client';
import { AutomationExecutionHistory } from './shared-execution-history.component';
export function FlowExecutionsComponent({ flowId }: { flowId: string }) {
  return (
    <AutomationExecutionHistory
      key={flowId}
      engine="instagram"
      flowId={flowId}
    />
  );
}
