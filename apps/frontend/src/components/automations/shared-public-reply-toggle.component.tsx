'use client';
export function AutomationPublicReplyToggle({
  enabled,
  onChange,
  label,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-boxHover border border-newTableBorder">
      <span className="text-[13px] text-textColor">{label}</span>
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
  );
}
