'use client';
import { FC, useCallback, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFlow } from './hooks/use-flows';
import { AutomationWizardComponent } from './automation-wizard.component';
import { StoryWizardComponent } from './story-wizard.component';
import { FlowEditorComponent } from './flow-editor.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  legacyQuickCompatible,
  readWorkspaceMode,
  useWorkspaceMode,
} from './shared-workspace-navigation';
export const AutomationWizardServerWrapper: FC<{ flowId: string }> = ({
  flowId,
}) => {
  const t = useT();
  const { data: flow, isLoading, error, mutate } = useFlow(flowId);
  if (isLoading) return <LoadingComponent />;
  if (error || !flow?.id || !Array.isArray(flow.nodes))
    return (
      <div role="alert" className="p-6 space-y-3">
        <p>{t('automation_workspace_load_failed')}</p>
        <button className="underline" onClick={() => void mutate()}>
          {t('fb_auto_retry')}
        </button>
      </div>
    );
  return <LoadedWorkspace key={flowId} flow={flow} refresh={mutate} />;
};
function LoadedWorkspace({
  flow,
  refresh,
}: {
  flow: any;
  refresh: () => Promise<any>;
}) {
  const t = useT();
  const params = useSearchParams();
  const editorState = useRef({ dirty: false, busy: false });
  const compatible = legacyQuickCompatible(flow);
  const safeQuickSnapshot = useRef(flow);
  if (compatible && !editorState.current.dirty && !editorState.current.busy)
    safeQuickSnapshot.current = flow;
  const requested = readWorkspaceMode(params);
  const [owner, setOwner] = useState<'quick' | 'flow'>(
    requested === 'flow' || !compatible ? 'flow' : 'quick'
  );
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const onEditorState = useCallback(
    (value: { dirty: boolean; busy: boolean }) => {
      editorState.current = value;
    },
    []
  );
  useEffect(() => {
    if (
      owner === 'quick' &&
      !compatible &&
      !editorState.current.dirty &&
      !editorState.current.busy
    )
      setOwner('flow');
  }, [compatible, owner]);
  const navigation = useWorkspaceMode(
    compatible ? 'quick' : 'flow',
    async (next) => {
      if (switching || editorState.current.busy) return false;
      setError(null);
      if (next === 'history' || next === owner) return true;
      if (editorState.current.dirty) {
        setError(t('automation_workspace_dirty_guard'));
        return false;
      }
      if (next === 'quick' && !compatible) {
        setError(t('automation_workspace_advanced_only'));
        return false;
      }
      setSwitching(true);
      try {
        const fresh = await refresh();
        if (!fresh?.id || !Array.isArray(fresh.nodes)) throw new Error('load');
        if (next === 'quick' && !legacyQuickCompatible(fresh)) {
          setError(t('automation_workspace_advanced_only'));
          return false;
        }
        if (editorState.current.dirty || editorState.current.busy) {
          setError(t('automation_workspace_dirty_guard'));
          return false;
        }
        return true;
      } catch {
        setError(t('automation_workspace_load_failed'));
        return false;
      } finally {
        setSwitching(false);
      }
    },
    (next) => {
      if (next !== 'history') setOwner(next);
    }
  );
  const workspace = {
    ...navigation,
    mode: navigation.mode === 'history' ? ('history' as const) : owner,
    quickDisabled: !compatible,
    readOnly: owner === 'quick' && !compatible,
    switching,
    error:
      error ||
      (owner === 'quick' && !compatible
        ? t('automation_workspace_advanced_only')
        : null),
    onEditorState,
  };
  if (owner === 'flow')
    return <FlowEditorComponent id={flow.id} workspace={workspace} />;
  const quickFlow = safeQuickSnapshot.current;
  const trigger = quickFlow.nodes.find((node: any) => node.type === 'TRIGGER');
  let story =
    trigger?.label === 'story_reply' ||
    (!trigger && params.get('type') === 'story');
  try {
    story ||= JSON.parse(trigger?.data || '{}').triggerType === 'story_reply';
  } catch {
    /* Invalid config is handled by compatibility guard. */
  }
  return story ? (
    <StoryWizardComponent
      flowId={flow.id}
      initialFlow={quickFlow}
      workspace={workspace}
    />
  ) : (
    <AutomationWizardComponent
      flowId={flow.id}
      initialFlow={quickFlow}
      workspace={workspace}
    />
  );
}
