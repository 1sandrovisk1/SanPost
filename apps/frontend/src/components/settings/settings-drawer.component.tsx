'use client';

import { useLayoutEffect, useId, useRef, type ReactNode } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function SettingsDrawer({
  id,
  title,
  children,
  footer,
  onClose,
}: {
  id: string;
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const backdropRelease = useRef(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Native modal semantics contain focus, make the background inert and
    // restore focus to the opener when closed, including on unmount.
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      id={id}
      aria-labelledby={titleId}
      aria-modal="true"
      className="fixed inset-y-0 left-auto right-0 !m-0 h-[100dvh] max-h-none w-full max-w-lg border-0 border-l border-newTableBorder bg-newBgColorInner p-0 text-newTextColor shadow-xl backdrop:bg-black/30"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        // Ignore a queued close from StrictMode cleanup if the dialog reopened.
        if (!event.currentTarget.open) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        // Keep boundary navigation in the guide, including embedded browsers
        // that otherwise move focus to browser chrome after the last control.
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, summary, [tabindex]'
          )
        ).filter((element) => {
          const style = window.getComputedStyle(element);
          return (
            !element.matches(':disabled, [tabindex="-1"]') &&
            !element.closest('[hidden], [inert]') &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          );
        });
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && event.target === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
        backdropRelease.current = false;
      }}
      onPointerUp={(event) => {
        backdropRelease.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (
          backdropPress.current &&
          backdropRelease.current &&
          event.target === event.currentTarget
        )
          onClose();
        backdropPress.current = false;
      }}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-newTableBorder p-5">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            autoFocus
            aria-label={t('close')}
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-boxHover focus-visible:ring-2 focus-visible:ring-btnPrimary"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 text-sm leading-relaxed">
          {children}
        </div>
        <footer className="shrink-0 border-t border-newTableBorder p-5">
          {footer}
        </footer>
      </div>
    </dialog>
  );
}
