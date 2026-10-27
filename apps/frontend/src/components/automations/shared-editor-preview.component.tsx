'use client';
import type { ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function AutomationPreviewPanel({
  children,
  desktopOnly = false,
}: {
  children: ReactNode;
  desktopOnly?: boolean;
}) {
  const t = useT();
  return (
    <aside
      aria-label={t('shared_preview')}
      className={`${
        desktopOnly ? 'hidden lg:flex' : 'flex'
      } min-w-0 flex-1 flex-col items-center bg-newBgColor border-t lg:border-t-0 lg:border-l border-newTableBorder p-6 lg:overflow-y-auto`}
    >
      <div className="w-full max-w-[340px] my-auto space-y-4 flex flex-col items-center">
        <div className="text-center">
          <h2 className="text-sm font-semibold">{t('shared_preview')}</h2>
          <p className="text-xs text-newTextColor/50 mt-1">
            {t('shared_preview_hint')}
          </p>
        </div>
        {children}
      </div>
    </aside>
  );
}

export function AutomationPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="[zoom:0.75] [@media(min-height:850px)]:[zoom:1]">
      {children}
    </div>
  );
}
