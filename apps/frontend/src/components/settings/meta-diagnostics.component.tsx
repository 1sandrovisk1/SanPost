'use client';

import type { ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { MetaCopyField } from './meta-copy-field.component';

export function DiagnosticSummary({
  title,
  status,
  children,
}: {
  title: string;
  status?: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 break-words font-semibold">{title}</h3>
        {status && (
          <span className="rounded-full bg-newBgColor px-2.5 py-1 text-xs">
            {status}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function DiagnosticSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-3 border-t border-newTableBorder pt-4"
      aria-label={title}
    >
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function DiagnosticField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 py-1 text-sm">
      <dt className="text-newTextColor/60">{label}</dt>
      <dd className="min-w-0 break-words text-right">{children}</dd>
    </div>
  );
}

export function DiagnosticDetails({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <details className="border-t border-newTableBorder pt-4">
      <summary className="cursor-pointer font-medium">
        {title || t('meta_diagnostic_technical')}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

// Identifiers only. Access tokens and app secrets never belong in diagnostics.
export function DiagnosticIdentifier({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return <MetaCopyField label={label} value={value} />;
}
