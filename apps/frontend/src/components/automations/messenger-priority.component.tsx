'use client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { sharedInputClass } from './shared-channel-posts.component';

export function MessengerPriority({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (priority: number) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <label className="block text-sm space-y-2">
        <span>{t('messenger_priority')}</span>
        <input
          type="number"
          min={1}
          max={1000}
          step={1}
          className={sharedInputClass}
          disabled={disabled}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.valueAsNumber)}
        />
      </label>
      <p className="text-xs text-newTextColor/60">
        {t('messenger_priority_hint')}
      </p>
    </div>
  );
}
