'use client';
import { AutomationExecutionHistory } from './shared-execution-history.component';
export function SharedFlowHistory({ id }: { id: string }) {
  return <AutomationExecutionHistory key={id} engine="shared" flowId={id} />;
}
