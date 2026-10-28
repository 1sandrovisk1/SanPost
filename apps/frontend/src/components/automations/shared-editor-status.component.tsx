'use client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import type { EditorStatus } from './shared-editor-actions';
import type { EditorPendingAction } from './shared-editor-footer.component';

export function AutomationStatusSwitch({
  status,
  busy,
  valid,
  pendingAction,
  onChange,
}: {
  status: EditorStatus;
  busy: boolean;
  valid: boolean;
  pendingAction?: EditorPendingAction;
  onChange: (status: 'ACTIVE' | 'PAUSED') => void;
}) {
  const t = useT();
  const active = status === 'ACTIVE';
  const changing =
    busy && (pendingAction === 'activate' || pendingAction === 'pause');
  return (
    <div className="flex items-center gap-3 text-sm">
      <span aria-live="polite" className="text-newTextColor/70">
        {t(
          changing
            ? pendingAction === 'activate'
              ? 'automation_activating'
              : 'automation_pausing'
            : `flow_status_${status.toLowerCase()}`
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-label={t(active ? 'pause_flow' : 'activate_flow')}
        aria-checked={active}
        aria-busy={changing}
        disabled={busy || status === 'ARCHIVED' || (!active && !valid)}
        onClick={() => onChange(active ? 'PAUSED' : 'ACTIVE')}
        className={`relative shrink-0 w-[44px] h-[24px] rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-btnPrimary focus-visible:ring-offset-2 disabled:opacity-50 ${
          active ? 'bg-btnPrimary' : 'bg-newTextColor/30'
        }`}
      >
        <span
          className={`absolute top-[2px] w-5 h-5 rounded-full bg-white transition-all ${
            active ? 'left-[22px]' : 'left-[2px]'
          }`}
        >
          {changing && (
            <span
              aria-hidden="true"
              className="absolute inset-1 rounded-full border-2 border-btnPrimary border-t-transparent animate-spin"
            />
          )}
        </span>
      </button>
    </div>
  );
}
