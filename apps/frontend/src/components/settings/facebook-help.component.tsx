'use client';

import { useId, useState } from 'react';
import { Tooltip } from 'react-tooltip';

/** Local help reuses the app's tooltip library without changing its global tooltip. */
export function FacebookHelp({ label, text }: { label: string; text: string }) {
  const id = `facebook-help-${useId().replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        data-tooltip-id={id}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-newTextColor/60 hover:bg-boxHover hover:text-newTextColor focus-visible:ring-2 focus-visible:ring-btnPrimary"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7v.5" />
        </svg>
      </button>
      <Tooltip
        id={id}
        place="bottom"
        positionStrategy="fixed"
        openEvents={{ mouseover: true, focus: true, click: true }}
        closeEvents={{ mouseout: true, blur: true }}
        globalCloseEvents={{
          escape: true,
          clickOutsideAnchor: true,
          scroll: true,
          resize: true,
        }}
        isOpen={open}
        setIsOpen={setOpen}
        clickable
        className="!z-[250] max-w-[min(18rem,calc(100vw-2rem))] !rounded-lg !text-xs !leading-relaxed !font-normal !shadow-lg"
        style={{
          backgroundColor: 'var(--new-bgColorInner)',
          color: 'rgb(var(--new-textColor))',
        }}
        border="1px solid var(--new-table-border)"
        opacity={1}
      >
        {text}
      </Tooltip>
    </>
  );
}
