'use client';
import { createContext, useContext } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const AutomationRequirementsContext = createContext<{
  valid: boolean;
  problems?: string[];
}>({ valid: true });
export function AutomationRequirements() {
  const t = useT(),
    { valid, problems } = useContext(AutomationRequirementsContext);
  if (valid || !problems?.length) return null;
  return (
    <section
      aria-label={t('automation_requirements_title')}
      aria-live="polite"
      className="w-full rounded-xl border border-amber-500/25 bg-newBgColorInner p-4 text-sm text-textColor shadow-sm"
    >
      <div className="flex items-start gap-3">
        <svg
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-amber-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M12 3 2 21h20L12 3ZM12 9v5m0 3h.01" />
        </svg>
        <div className="min-w-0">
          <h3 className="font-semibold mb-2">
            {t('automation_requirements_title')}
          </h3>
          <ul className="space-y-2 text-xs leading-relaxed text-newTextColor/75">
            {[...new Set(problems)].map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
