'use client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import type { EditorStatus } from './shared-editor-actions';
export type EditorPendingAction = 'save' | 'activate' | 'pause';
export function AutomationEditorFeedback({
  status,
  dirty,
  busy,
  pendingAction = 'save',
  valid,
  problems = [],
  impact,
  error,
  onSave,
}: {
  status: EditorStatus;
  dirty: boolean;
  busy: boolean;
  pendingAction?: EditorPendingAction;
  valid: boolean;
  problems?: string[];
  impact?: string;
  error?: string | null;
  onSave: () => void;
}) {
  const t = useT();
  const active = status === 'ACTIVE';
  return (
    <>
      <div
        className="text-xs text-newTextColor/70 space-y-2"
        aria-live="polite"
      >
        {dirty && <p>{t('shared_unsaved')}</p>}
        {active && dirty && impact && <p className="font-medium">{impact}</p>}
        {!valid && problems.length > 0 && (
          <div>
            <p>{problems[0]}</p>
            {problems.length > 1 && (
              <details className="mt-1">
                <summary className="cursor-pointer">
                  {t('automation_more_pending').replace(
                    '{count}',
                    String(problems.length - 1)
                  )}
                </summary>
                <ul className="list-disc pl-4 space-y-1 mt-1">
                  {problems.slice(1).map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-btnPrimary">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
export type EditorActionProps = Parameters<typeof AutomationEditorFeedback>[0];
export function AutomationSaveAction({
  status,
  dirty,
  busy,
  pendingAction = 'save',
  valid,
  onSave,
}: EditorActionProps) {
  const t = useT();
  if (status === 'ARCHIVED') return null;
  return (
    <Button
      disabled={busy || !dirty || !valid}
      className="rounded-lg disabled:!bg-newBgColor disabled:!text-newTextColor/45 disabled:!opacity-100"
      loading={busy && pendingAction === 'save'}
      loadingLabel={t('saving_flow')}
      onClick={onSave}
    >
      {t('save_flow')}
    </Button>
  );
}
export function AutomationEditorFooter(props: EditorActionProps) {
  const t = useT();
  return (
    <footer
      aria-label={t('automation_editor_actions')}
      className="sticky bottom-0 z-10 shrink-0 border-t border-newTableBorder bg-newBgColorInner p-4 space-y-3"
    >
      <AutomationEditorFeedback {...props} />
      <div className="flex justify-end">
        <AutomationSaveAction {...props} />
      </div>
    </footer>
  );
}
