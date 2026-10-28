'use client';
import { useId } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { AutomationMessageVariables } from './shared-message-variables.component';
export function PrivateMessageVariations({
  messages,
  onChange,
  disabled = false,
  onFocus,
  maxLength = 2000,
  engine = 'legacy',
  messenger = false,
}: {
  messages: string[];
  onChange: (messages: string[]) => void;
  disabled?: boolean;
  onFocus?: (index: number) => void;
  maxLength?: number;
  engine?: 'legacy' | 'shared';
  messenger?: boolean;
}) {
  const t = useT(),
    id = useId(),
    entries = messages.length ? messages : [''];
  const update = (index: number, value: string) =>
    onChange(entries.map((m, i) => (i === index ? value : m)));
  return (
    <div className="space-y-3">
      {entries.map((message, index) => (
        <div key={index} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${id}-${index}`} className="block text-sm">
              {index === 0
                ? t('shared_message')
                : `${t('automation_private_variant')} ${index + 1}`}
            </label>
            {entries.length > 1 && (
              <button
                type="button"
                disabled={disabled}
                aria-label={`${t('shared_reply_remove')} ${index + 1}`}
                onClick={() => onChange(entries.filter((_, i) => i !== index))}
                className="px-2 text-lg text-newTextColor/60 hover:text-btnPrimary"
              >
                ×
              </button>
            )}
          </div>
          <textarea
            id={`${id}-${index}`}
            disabled={disabled}
            value={message}
            maxLength={maxLength}
            rows={4}
            placeholder={t('automation_private_message_placeholder')}
            onFocus={() => onFocus?.(index)}
            onChange={(e) => update(index, e.target.value)}
            className="block w-full rounded-lg border border-newTableBorder bg-newBgColorInner px-3.5 py-2.5 text-[13px] text-textColor resize-y"
          />
          <div className="flex items-center justify-between gap-2">
            <AutomationMessageVariables
              textareaId={`${id}-${index}`}
              engine={engine}
              messenger={messenger}
              disabled={disabled}
              onChange={(value) => update(index, value)}
            />
            <span className="text-xs text-newTextColor/50">
              {message.length}/{maxLength}
            </span>
          </div>
        </div>
      ))}
      <div className="flex justify-between gap-2 text-xs">
        <button
          type="button"
          disabled={disabled || entries.length >= 10}
          className="text-btnPrimary disabled:opacity-40"
          onClick={() => onChange([...entries, ''])}
        >
          <span aria-hidden="true">+ </span>
          {t('wizard_add_reply_variant')}
        </button>
        <span className="text-newTextColor/50">{entries.length}/10</span>
      </div>
      {entries.length > 1 && (
        <p className="text-xs text-newTextColor/60">
          {t('automation_private_variations_hint')}
        </p>
      )}
    </div>
  );
}
