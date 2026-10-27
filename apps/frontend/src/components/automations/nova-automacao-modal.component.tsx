'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { automationEntryOptions } from './shared-automation-entry';

type Props = { open: boolean; onClose: () => void; onCreated?: () => void };
export function NovaAutomacaoModal({ open, onClose }: Props) {
  // Remount the chooser on each opening; no draft or credential requests here.
  return open ? <TriggerChooser onClose={onClose} /> : null;
}
function TriggerChooser({ onClose }: Pick<Props, 'onClose'>) {
  const t = useT();
  const router = useRouter();
  const id = useId();
  const [network, setNetwork] = useState<'instagram' | 'facebook'>('instagram');
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current
      ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
      ?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-newTableBorder bg-newBgColorInner text-textColor shadow-xl"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          if (e.key !== 'Tab') return;
          const controls = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled):not([tabindex="-1"]), a[href]'
            ) || []
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (e.shiftKey && e.target === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && e.target === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className="flex items-start justify-between gap-4 p-6 pb-4">
          <div>
            <h2 id={`${id}-title`} className="text-xl font-semibold">
              {t('new_automation')}
            </h2>
            <p className="mt-2 text-sm text-newTextColor/60">
              {t('automation_choose_trigger')}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('close')}
            onClick={onClose}
            className="h-9 w-9 shrink-0 rounded-lg text-xl hover:bg-boxHover focus-visible:ring-2 focus-visible:ring-btnPrimary"
          >
            ×
          </button>
        </header>
        <div className="px-6 pb-6">
          <div
            role="tablist"
            aria-label={t('automation_choose_network')}
            className="mb-5 grid grid-cols-2 rounded-xl bg-newBgColor p-1"
          >
            {(['instagram', 'facebook'] as const).map((platform) => (
              <button
                key={platform}
                type="button"
                role="tab"
                id={`${id}-${platform}`}
                aria-controls={`${id}-triggers`}
                aria-selected={network === platform}
                tabIndex={network === platform ? 0 : -1}
                onClick={() => setNetwork(platform)}
                onKeyDown={(e) => {
                  if (
                    !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  const next =
                    e.key === 'Home'
                      ? 'instagram'
                      : e.key === 'End'
                      ? 'facebook'
                      : platform === 'facebook'
                      ? 'instagram'
                      : 'facebook';
                  setNetwork(next);
                  document.getElementById(`${id}-${next}`)?.focus();
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary ${
                  network === platform
                    ? 'bg-newBgColorInner font-semibold shadow-sm'
                    : 'text-newTextColor/60 hover:text-textColor'
                }`}
              >
                <img
                  src={`/icons/platforms/${platform}.png`}
                  alt=""
                  className="h-5 w-5 object-contain"
                />
                {platform === 'instagram' ? 'Instagram' : 'Facebook'}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${id}-triggers`}
            aria-labelledby={`${id}-${network}`}
            className="space-y-3"
          >
            {automationEntryOptions[network].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  onClose();
                  router.push(option.href);
                }}
                className="group flex w-full items-center gap-4 rounded-xl border border-newTableBorder p-4 text-left hover:border-btnPrimary hover:bg-btnPrimary/5 focus-visible:ring-2 focus-visible:ring-btnPrimary"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-newBgColor">
                  <img
                    src={`/icons/platforms/${option.icon}.${
                      option.icon === 'messenger' ? 'svg' : 'png'
                    }`}
                    alt=""
                    className="h-6 w-6 object-contain"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm">
                    {t(`automation_start_${option.key}`)}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-newTextColor/60">
                    {t(`automation_start_${network}_${option.key}_hint`)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-newTextColor/50 group-hover:text-btnPrimary"
                >
                  →
                </span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-xs text-newTextColor/60">
            {t('automation_start_unsaved')}
          </p>
        </div>
      </div>
    </div>
  );
}
