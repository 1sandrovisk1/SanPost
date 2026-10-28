'use client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
/** Legacy Instagram interpolation only. Never reuse these tokens in the V2 engine. */
export function AutomationMessageVariables({
  textareaId,
  onChange,
  disabled = false,
}: {
  textareaId: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-newTextColor/65 mt-2">
      <span>{t('automation_insert_variable')}</span>
      <select
        aria-label={t('automation_insert_variable')}
        disabled={disabled}
        value=""
        className="rounded-lg border border-newTableBorder bg-newBgColorInner py-1 pl-2 text-xs"
        onChange={(e) => {
          const token = e.target.value;
          const field = document.getElementById(textareaId);
          if (!token || !(field instanceof HTMLTextAreaElement)) return;
          const start = field.selectionStart,
            end = field.selectionEnd;
          onChange(
            field.value.slice(0, start) + token + field.value.slice(end)
          );
          requestAnimationFrame(() => {
            field.focus();
            field.setSelectionRange(start + token.length, start + token.length);
          });
        }}
      >
        <option value="">{t('automation_choose_variable')}</option>
        {['commenter_name', 'commenter_id', 'comment_text', 'media_id'].map(
          (name) => (
            <option key={name} value={`{${name}}`}>
              {t(`automation_variable_${name}`)}
            </option>
          )
        )}
      </select>
    </label>
  );
}
