'use client';
import type { ReactNode } from 'react';
export function AutomationPublicReplyToggle({
  enabled,
  onChange,
  label,
  disabled = false,
  children,
  help,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  children?: ReactNode;
  help?: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <span className="text-[13px] text-textColor">{label}</span>
          {help}
        </div>
        <button
          type="button"
          role="switch"
          aria-label={label}
          aria-checked={enabled}
          disabled={disabled}
          onClick={() => onChange(!enabled)}
          className={`relative shrink-0 w-[44px] h-[24px] rounded-full transition-colors disabled:opacity-50 ${
            enabled ? 'bg-btnPrimary' : 'bg-newTextColor/30'
          }`}
        >
          <span
            className={`absolute top-[2px] w-5 h-5 rounded-full bg-white transition-all ${
              enabled ? 'left-[22px]' : 'left-[2px]'
            }`}
          />
        </button>
      </div>
      {enabled && children && <div className="mt-3">{children}</div>}
    </div>
  );
}
