'use client';

import React, { FC, ReactNode, useEffect, useRef } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  ChevronRightIcon,
  CloseIcon,
} from '@gitroom/frontend/components/ui/icons';

export const BottomSheetHeader: FC<{
  title: ReactNode;
  onClose: () => void;
}> = ({ title, onClose }) => {
  const t = useT();
  return (
    <>
      <div className="self-center w-[33px] h-[4px] mb-[8px] rounded-[2px] bg-newSep" />
      <div className="flex items-center gap-[8px] h-[60px] mb-[16px] px-[16px]">
        <div className="flex-1 text-[20px] font-[600]">{title}</div>
        <button
          type="button"
          aria-label={t('close', 'Close')}
          onClick={onClose}
          className="w-[32px] h-[32px] flex justify-end items-center cursor-pointer text-[#A3A3A3]"
        >
          <CloseIcon />
        </button>
      </div>
    </>
  );
};

export const BottomSheetButton: FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}> = ({ label, onClick, disabled }) => {
  return (
    <div className="px-[16px] pt-[12px]">
      <button
        disabled={disabled}
        onClick={onClick}
        className="w-full h-[44px] rounded-[8px] bg-btnPrimary text-white text-[15px] font-[600] disabled:bg-btnSimple disabled:text-textItemBlur"
      >
        {label}
      </button>
    </div>
  );
};

// slides up from the bottom of the screen, opened from the mobile layout
export const BottomSheet: FC<{
  title: string;
  onClose: () => void;
  children: ReactNode;
  // the main action under the content, like Done or Save
  button?: { label: string; onClick: () => void; disabled?: boolean };
}> = ({ title, onClose, children, button }) => {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'
        ) || []
      ).filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      previous?.focus();
    };
  }, []);
  // the support chat bubble would cover the sheet button
  useEffect(() => {
    document.querySelector('body')?.classList.add('bottomSheetOpen');
    return () => {
      document.querySelector('body')?.classList.remove('bottomSheetOpen');
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[600] flex flex-col justify-end">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-popup backdrop-blur-[8px] animate-fadeIn touch-none"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90%] flex flex-col bg-newBgColorInner rounded-t-[24px] pt-[8px] pb-[24px] animate-fade"
      >
        <BottomSheetHeader title={title} onClose={onClose} />
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-[16px] scrollbar scrollbar-thumb-newColColor scrollbar-track-newBgColorInner">
          {children}
        </div>
        {button && <BottomSheetButton {...button} />}
      </div>
    </div>
  );
};

export const BottomSheetRow: FC<{
  icon: ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-[12px] py-[8px] cursor-pointer select-none"
    >
      <div className="text-[#A3A3A3]">{icon}</div>
      <div className="flex-1 text-[15px] font-[600]">{label}</div>
      <ChevronRightIcon size={20} className="text-[#A3A3A3] rtl:rotate-180" />
    </button>
  );
};
