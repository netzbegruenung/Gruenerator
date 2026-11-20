import { useMobileKeyboardOffset } from '@gruenerator/shared/hooks';
import { cn, useMeasuredCornerReservation } from '@gruenerator/ui';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { FiSearch, FiX } from 'react-icons/fi';
import { useLocation } from 'react-router-dom';

import './arbeitenSearchFab.css';

/** What the host has to hand the search field so it can live inside the morph. */
export interface SearchFabSlots {
  rootClassName: string;
  pillClassName: string;
  resultsPlacement: 'above';
  /** The "Suche schließen" button, to sit inside the field's pill. */
  toolbarSlot: ReactNode;
}

/**
 * Phone-only search for the Arbeiten tab: a round button bottom right that morphs
 * into the search bar docked above the keyboard. The field itself (and its search)
 * is whatever `children` renders — this component only owns open/close, focus and
 * the motion, so there is no second search implementation.
 *
 * The caller decides when it is mounted (phones only). The UI is portalled to
 * `document.body`: the tab's scroll container carries a `mask-image`, which masks
 * even `position: fixed` descendants (measured: the bar vanished) — and a portal
 * also keeps the field from scrolling that container when it takes focus. Because
 * a portal escapes the hidden tab's `display: none`, the component watches a
 * sentinel in the tab and renders nothing while an ancestor is `hidden`.
 */
export function ArbeitenSearchFab({
  label,
  children,
}: {
  /** Accessible name of the search region. */
  label: string;
  children: (slots: SearchFabSlots) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(true);
  const sentinelRef = useRef<HTMLSpanElement>(null);
  const regionId = useId();
  const fabRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Focus goes back to the button after Escape / the close button — not after a
  // tap elsewhere (that would steal focus from what was just tapped) or a navigation.
  const refocusFab = useRef(false);
  const { pathname } = useLocation();

  useMobileKeyboardOffset(barRef);

  // The feedback launcher would sit in the same corner: on this page it is hidden
  // (both bottom corners blocked) while the search button is shown, and while the
  // bar is open (full width) — the bar and its results need the room.
  useMeasuredCornerReservation(fabRef, {
    corner: ['bottom-left', 'bottom-right'],
    axis: 'vertical',
    blocked: true,
    active: !open,
  });
  useMeasuredCornerReservation(barRef, {
    corner: ['bottom-left', 'bottom-right'],
    axis: 'vertical',
    blocked: true,
    active: open,
  });

  const close = useCallback((returnFocus: boolean) => {
    refocusFab.current = returnFocus;
    setOpen(false);
  }, []);

  // Pre-mounted behind another tab (`hidden` on an ancestor): show nothing there.
  useLayoutEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    const sync = () => {
      const next = sentinel.closest('[hidden]') === null;
      setShown(next);
      if (!next) setOpen(false);
    };
    sync();
    // Going from display:none to shown changes the sentinel's size, which is the cue.
    const observer = new ResizeObserver(sync);
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Runs in the same commit as the state change, i.e. still inside the tap — iOS
  // only raises the keyboard for a focus() made from a user gesture.
  useLayoutEffect(() => {
    if (open) {
      barRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
    } else if (refocusFab.current) {
      refocusFab.current = false;
      fabRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // Tap outside.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  // A hit was opened (or the tab was switched): fold the bar away.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    close(false);
  }, [pathname, close]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close(true);
    }
  };

  const ui = (
    <div
      data-open={open}
      className="arbeiten-search pointer-events-none fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[150]"
    >
      {/* `inert` while folded: the field is still laid out (the clip reveals it), but
          neither focus nor the screen reader may reach it. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape bubbles up from the field inside */}
      <div
        ref={barRef}
        id={regionId}
        role="search"
        aria-label={label}
        inert={!open}
        onKeyDown={onKeyDown}
        className={cn(open && 'pointer-events-auto')}
        style={{ bottom: 'var(--mobile-keyboard-offset, 0px)', position: 'relative' }}
      >
        {children({
          rootClassName: 'mt-0 max-w-none',
          pillClassName: 'arbeiten-search__pill',
          resultsPlacement: 'above',
          toolbarSlot: (
            <button
              type="button"
              aria-label="Suche schließen"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => close(true)}
              className="flex size-11 flex-none items-center justify-center rounded-full text-[#5C6B63] transition-colors hover:bg-[#F1F4F1] dark:text-grey-300 dark:hover:bg-grey-700"
            >
              <FiX className="size-5" aria-hidden="true" />
            </button>
          ),
        })}
      </div>

      <button
        ref={fabRef}
        type="button"
        aria-label="Suchen"
        aria-expanded={open}
        aria-controls={regionId}
        inert={open}
        onClick={() => setOpen(true)}
        className="arbeiten-search__fab pointer-events-auto absolute bottom-0 right-0 flex size-12 items-center justify-center rounded-full bg-[#4C8A6E] text-white shadow-[0_4px_14px_rgba(31,63,51,.28)] transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3E7A5F]"
      >
        <FiSearch className="size-5" strokeWidth={2.1} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <>
      <span ref={sentinelRef} aria-hidden="true" className="block h-px" />
      {shown && createPortal(ui, document.body)}
    </>
  );
}
