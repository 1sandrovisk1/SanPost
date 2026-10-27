'use client';
import { useId } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function AutomationAccountSelect({
  label,
  value,
  accounts,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  accounts: { id: string; name: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const t = useT();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full min-h-[42px] rounded-lg border border-newTableBorder bg-newBgColorInner px-3 py-2 text-sm text-textColor disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-btnPrimary"
      >
        <option value="">{t('select_account')}</option>
        {value && !accounts.some((a) => a.id === value) && (
          <option value={value}>{t('automation_account_unavailable')}</option>
        )}
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </div>
  );
}
