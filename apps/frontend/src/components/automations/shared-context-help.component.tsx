'use client';
import { type ReactNode } from 'react';
/** Native disclosure: available on touch and keyboard, anchored beside its label. */
export function AutomationContextHelp({
  label,
  children,
  align = 'end',
}: {
  label: string;
  children: ReactNode;
  align?: 'start' | 'end';
}) {
  return (
    <details className="group min-w-0 inline-block align-middle text-left">
      <summary
        aria-label={label}
        className="list-none cursor-pointer rounded-full p-1 text-newTextColor/55 hover:text-newTextColor focus-visible:ring-2 focus-visible:ring-btnPrimary [&::-webkit-details-marker]:hidden"
      >
        <svg
          aria-hidden="true"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </svg>
      </summary>
      <div
        className={`mt-1 w-[min(280px,65vw)] max-w-full rounded-lg border border-newTableBorder bg-newBgColorInner p-3 text-xs font-normal leading-relaxed text-newTextColor shadow-sm ${
          align === 'end' ? 'ml-auto' : ''
        }`}
      >
        {children}
      </div>
    </details>
  );
}
