'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function MetaCopyButton({
  value,
  onCopy,
}: {
  value: string;
  onCopy?: () => Promise<void>;
}) {
  const t = useT();
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>(
    'idle'
  );
  const version = useRef(0);
  useEffect(() => {
    version.current++;
    setStatus('idle');
    return () => {
      version.current++;
    };
  }, [value]);
  return (
    <div className="shrink-0 space-y-1">
      <Button
        secondary
        loading={status === 'copying'}
        loadingLabel={t('meta_action_copying')}
        disabled={!value}
        className="!h-9 !px-3 rounded-lg border border-newTableBorder text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary"
        onClick={async () => {
          if (status === 'copying') return;
          const request = version.current;
          setStatus('copying');
          try {
            await (onCopy ? onCopy() : navigator.clipboard.writeText(value));
            if (version.current === request) setStatus('copied');
          } catch {
            if (version.current === request) setStatus('error');
          }
        }}
      >
        {status === 'copied' ? t('fb_auto_copied') : t('fb_auto_copy')}
      </Button>
      {status === 'error' && (
        <p role="alert" className="max-w-48 text-xs text-newTextColor">
          {t('meta_copy_error')}
        </p>
      )}
      {status === 'copied' && (
        <span role="status" className="sr-only">
          {t('fb_auto_copied')}
        </span>
      )}
    </div>
  );
}

export function MetaCopyField({
  label,
  value,
  secret = false,
  help,
  onCopy,
}: {
  label: string;
  value: string;
  secret?: boolean;
  help?: ReactNode;
  onCopy?: () => Promise<void>;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {help}
      </div>
      <div className="flex items-start gap-2">
        <input
          id={id}
          readOnly
          type={secret ? 'password' : 'text'}
          autoComplete="off"
          value={value}
          className="min-w-0 flex-1 h-9 rounded-lg border border-newTableBorder bg-newBgColorInner p-2 font-mono text-xs"
          onFocus={(event) => event.target.select()}
        />
        <MetaCopyButton value={value} onCopy={onCopy} />
      </div>
    </div>
  );
}
