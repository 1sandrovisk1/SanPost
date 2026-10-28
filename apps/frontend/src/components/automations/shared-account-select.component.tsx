'use client';
import { useId, type ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function AutomationAccountSelect({
  label,
  value,
  accounts,
  onChange,
  disabled = false,
  connection,
}: {
  label: string;
  value: string;
  accounts: { id: string; name: string; picture?: string | null }[];
  connection?: ReactNode;
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
      <div className="relative flex items-center">
        {value && (
          <span className="pointer-events-none absolute left-3 flex w-6 h-6 items-center justify-center overflow-hidden rounded-full bg-boxHover text-xs">
            {accounts.find((a) => a.id === value)?.picture ? (
              <img
                src={accounts.find((a) => a.id === value)!.picture!}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              (accounts.find((a) => a.id === value)?.name || '?').slice(0, 1)
            )}
          </span>
        )}
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            paddingLeft: value ? 46 : undefined,
            paddingRight: connection ? 72 : undefined,
          }}
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
        {connection && (
          <span className="absolute right-9 flex items-center">
            {connection}
          </span>
        )}
      </div>
    </div>
  );
}
