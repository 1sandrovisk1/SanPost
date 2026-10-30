'use client';
import { useId, useState, type ReactNode } from 'react';
const colors = {
  account: 'trigger',
  origin: 'media',
  conditions: 'condition',
  public: 'comment',
  private: 'dm',
  followers: 'follow',
  extras: 'extras',
};
const paths = {
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21v-2a7 7 0 0 1 14 0v2',
  origin: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01',
  conditions: 'M3 4h18l-7 8v7l-4 2v-9z',
  public: 'M4 4h16v13H9l-5 4zM8 9h8M8 13h5',
  private: 'm21 3-7 18-4-7-7-4 18-7Zm0 0L10 14',
  followers:
    'M16 21v-2a6 6 0 0 0-12 0v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 4a4 4 0 0 1 0 8m3 9v-2a6 6 0 0 0-3-5',
  extras:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM10 2h4l1 4 4-1 2 4-3 3 3 3-2 4-4-1-1 4h-4l-1-4-4 1-2-4 3-3-3-3 2-4 4 1z',
};
export function AutomationEditorStage({
  kind,
  step,
  title,
  summary,
  children,
}: {
  kind: keyof typeof colors;
  step: number;
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  const id = useId(),
    [open, setOpen] = useState(true);
  return (
    <section
      aria-label={title}
      className={`automation-stage automation-color-${colors[kind]} rounded-xl border border-l-4`}
    >
      <h2>
        <button
          type="button"
          aria-label={title}
          aria-expanded={open}
          aria-controls={id}
          aria-describedby={summary ? `${id}-summary` : undefined}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-4 text-left"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-newBgColorInner text-xs font-semibold automation-ink"
          >
            {step}
          </span>
          <svg
            aria-hidden="true"
            className="h-6 w-6 shrink-0 automation-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={paths[kind]} />
          </svg>
          <span className="min-w-0 flex-1 text-sm font-semibold text-textColor">
            {title}
          </span>
          {summary && (
            <span
              id={`${id}-summary`}
              className="max-w-[40%] truncate rounded-full bg-newBgColorInner px-2 py-1 text-[11px] font-medium automation-ink"
            >
              {summary}
            </span>
          )}
          <svg
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 transition-transform automation-accent ${
              open ? 'rotate-180' : ''
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h2>
      <div
        id={id}
        hidden={!open}
        className="automation-stage-content mx-3 mb-3 rounded-lg bg-newBgColorInner p-3 space-y-3"
      >
        {children}
      </div>
    </section>
  );
}
