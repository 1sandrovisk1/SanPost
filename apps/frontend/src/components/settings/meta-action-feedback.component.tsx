'use client';
import type { ReactNode } from 'react';
export function MetaActionFeedback({
  error = false,
  children,
}: {
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <p
      role={error ? 'alert' : 'status'}
      aria-atomic="true"
      className={`rounded-lg border px-3 py-2 text-sm ${
        error
          ? 'border-red-500/30 bg-red-500/5 text-newTextColor'
          : 'border-green-500/20 bg-green-500/5 text-green-700 dark:text-green-400'
      }`}
    >
      {children}
    </p>
  );
}
