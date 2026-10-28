'use client';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
/** Portal keeps help out of the label's layout, including inside drawers. */
export function AutomationContextHelp({
  label,
  children,
  align = 'end',
  href,
  icon,
  triggerClassName,
}: {
  label: string;
  children: ReactNode;
  align?: 'start' | 'end';
  href?: string;
  icon?: ReactNode;
  triggerClassName?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const stay = () => {
    clearTimeout(leaveTimer.current);
    setOpen(true);
  };
  const leave = () => {
    if (!pinned.current)
      leaveTimer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const close = () => {
    clearTimeout(leaveTimer.current);
    pinned.current = false;
    setOpen(false);
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const rect = bubble.current?.getBoundingClientRect();
      if (!anchor || !rect) return;
      const left = align === 'end' ? anchor.right - rect.width : anchor.left;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)),
        top: Math.max(
          8,
          anchor.bottom + 8 + rect.height <= window.innerHeight
            ? anchor.bottom + 8
            : anchor.top - rect.height - 8
        ),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, children]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !bubble.current?.contains(event.target)
      )
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const Trigger = href ? 'a' : 'button';
  return (
    <>
      <Trigger
        ref={(element: HTMLAnchorElement | HTMLButtonElement | null) => {
          trigger.current = element;
        }}
        {...(href
          ? { href, target: '_blank', rel: 'noreferrer' }
          : { type: 'button' as const })}
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={stay}
        onMouseLeave={leave}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => {
          if (href) return;
          if (pinned.current) close();
          else {
            pinned.current = true;
            setOpen(true);
          }
        }}
        className={`inline-flex shrink-0 align-middle items-center justify-center rounded-full p-1 hover:bg-boxHover focus-visible:ring-2 focus-visible:ring-btnPrimary ${
          triggerClassName || 'text-newTextColor/55 hover:text-newTextColor'
        }`}
      >
        {icon || (
          <>
            {' '}
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
          </>
        )}
      </Trigger>
      {open &&
        createPortal(
          <div
            id={id}
            ref={bubble}
            role="tooltip"
            style={{ position: 'fixed', ...position }}
            onMouseEnter={stay}
            onMouseLeave={leave}
            className="z-[10000] w-[min(280px,calc(100vw-16px))] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-lg border border-newTableBorder bg-newBgColorInner p-3 text-xs font-normal leading-relaxed text-newTextColor shadow-lg"
          >
            {children}
          </div>,
          trigger.current?.closest('dialog') || document.body
        )}
    </>
  );
}
