'use client';
import { useEffect, type ReactNode } from 'react';
import { AutomationContextHelp } from './shared-context-help.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function AutomationPreviewPanel({
  children,
  desktopOnly = false,
  controls,
}: {
  children: ReactNode;
  desktopOnly?: boolean;
  controls?: ReactNode;
}) {
  const t = useT();
  return (
    <aside
      aria-label={t('shared_preview')}
      className={`${
        desktopOnly ? 'hidden lg:flex' : 'flex'
      } min-w-0 lg:min-h-0 flex-1 flex-col items-center bg-newBgColor border-t lg:border-t-0 lg:border-l border-newTableBorder p-6 lg:overflow-hidden`}
    >
      {controls && (
        <div className="w-full flex justify-end shrink-0 pb-4">{controls}</div>
      )}
      <div className="w-full min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain flex flex-col items-center">
        <div className="w-full max-w-[340px] shrink-0 my-auto space-y-4 flex flex-col items-center">
          <div className="text-center">
            <h2 className="text-sm font-semibold">{t('shared_preview')}</h2>
            <div className="flex items-center justify-center gap-1 text-xs text-newTextColor/50 mt-1">
              <span>{t('automation_preview_illustrative')}</span>
              <AutomationContextHelp label={t('automation_preview_help')}>
                {t('shared_preview_hint')}
              </AutomationContextHelp>
            </div>
          </div>
          {children}
        </div>
      </div>
    </aside>
  );
}

export function AutomationEditorLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    const resetPageScroll = () => {
      if (window.innerWidth >= 1024 && document.scrollingElement)
        document.scrollingElement.scrollTop = 0;
    };
    resetPageScroll();
    window.addEventListener('resize', resetPageScroll);
    return () => window.removeEventListener('resize', resetPageScroll);
  }, []);
  return (
    <div className="automation-editor automation-editor--quick flex flex-col lg:flex-row flex-1 min-w-0 w-full text-textColor lg:h-[calc(100dvh-105px)] lg:min-h-0 lg:overflow-hidden">
      {children}
    </div>
  );
}

export function AutomationPhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="[zoom:0.93] [@media(min-height:1050px)]:[zoom:1]">
      {children}
    </div>
  );
}
