'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { SettingsDrawer } from './settings-drawer.component';

export function SettingsHelpButton({
  open,
  drawerId,
  onClick,
}: {
  open: boolean;
  drawerId: string;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <Button
      secondary
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? drawerId : undefined}
      onClick={onClick}
      className="!h-9 !px-3 shrink-0 rounded-lg border border-newTableBorder text-sm text-newTextColor focus-visible:ring-2 focus-visible:ring-btnPrimary"
      innerClassName="gap-2"
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 16.5h.01" />
      </svg>
      {t('meta_help', 'Ajuda')}
    </Button>
  );
}

export function SettingsHelpDrawer({
  id,
  network,
  guide,
  diagnostics,
  onClose,
}: {
  id: string;
  network: string;
  guide: ReactNode;
  diagnostics: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  const tabsId = useId();
  const [section, setSection] = useState(0);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <SettingsDrawer
      id={id}
      title={`${t('meta_help', 'Ajuda')} · ${network}`}
      onClose={onClose}
      footer={
        <Button
          secondary
          onClick={onClose}
          className="w-full rounded-lg border border-newTableBorder text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary"
        >
          {t('meta_help_back', 'Fechar ajuda')}
        </Button>
      }
    >
      <div
        role="tablist"
        aria-label={t('meta_help_sections', 'Seções da ajuda')}
        className="grid grid-cols-2 gap-1 rounded-lg bg-newBgColor p-1"
      >
        {[
          t('meta_help_guide', 'Como configurar'),
          t('meta_help_diagnostics', 'Diagnóstico'),
        ].map((label, index) => (
          <button
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${index}`}
            aria-selected={section === index}
            aria-controls={`${tabsId}-panel`}
            tabIndex={section === index ? 0 : -1}
            className={`rounded-md px-2 py-2 text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary ${
              section === index
                ? 'bg-newBgColorInner font-medium shadow-sm'
                : 'text-newTextColor/60'
            }`}
            onClick={() => setSection(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                  ? 1
                  : ['ArrowLeft', 'ArrowRight'].includes(event.key)
                  ? 1 - index
                  : null;
              if (next === null) return;
              event.preventDefault();
              setSection(next);
              refs.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-panel`}
        aria-labelledby={`${tabsId}-tab-${section}`}
        tabIndex={0}
        className="space-y-5 focus-visible:ring-2 focus-visible:ring-btnPrimary"
      >
        {section === 0 ? (
          guide
        ) : (
          <>
            <p className="text-xs text-newTextColor/60">
              {t('meta_diagnostic_recorded')}
            </p>
            {diagnostics}
          </>
        )}
      </div>
    </SettingsDrawer>
  );
}

export function HelpStep({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-newTableBorder bg-newBgColor text-xs font-semibold"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-semibold text-newTextColor">{title}</h3>
        <div className="space-y-3 text-newTextColor/70">{children}</div>
      </div>
    </li>
  );
}
