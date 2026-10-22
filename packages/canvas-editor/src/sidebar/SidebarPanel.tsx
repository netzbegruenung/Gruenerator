import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { PiX } from 'react-icons/pi';

import { useIsCanvasMobile } from '../hooks/useIsCanvasMobile';
import { useMobileSheet } from '../hooks/useMobileSheet';
import { cn } from '../utils/cn';

import type { SidebarPanelProps } from './types';

interface ExtendedSidebarPanelProps extends SidebarPanelProps {
  /** Sheet title on mobile — the label of the active area. */
  title?: string;
  onClose?: () => void;
}

/**
 * Desktop-rail panel width in px. Mirrors the `348px` in the
 * `canvas-mobile:w-[348px]`/`max-w-[348px]` classes below — kept as a separate
 * literal because Tailwind's static scanner needs the class's arbitrary value
 * to appear as literal text, so it can't be generated from this constant.
 * Change both together.
 */
const SIDEBAR_PANEL_DESKTOP_WIDTH_PX = 348;

/**
 * Mobile sheet lifecycle. `entering` slides in (CSS, `@starting-style`) with
 * an empty body; `open` mounts the content; `closing` slides out and keeps
 * the sheet mounted; `closed` renders nothing.
 */
type SheetPhase = 'closed' | 'entering' | 'open' | 'closing';

/**
 * Upper bound for one slide (enter 280 ms, exit 200 ms). `transitionend`
 * never comes under reduced motion without a transform transition, while
 * hidden, or in jsdom — the timer moves the phase on regardless.
 */
const SHEET_TRANSITION_FALLBACK_MS = 350;

export function SidebarPanel({ isOpen, title, children, onClose }: ExtendedSidebarPanelProps) {
  const isDesktop = !useIsCanvasMobile();

  // Reports the panel's desktop-rail width so CanvasEditorLayout can indent the
  // stage clear of it (Befund 8: the panel otherwise sits on top of the stage).
  // Cleared on close, unmount, and the switch to the mobile bottom-sheet layout.
  useEffect(() => {
    if (!isOpen || !isDesktop) {
      document.documentElement.style.removeProperty('--canvas-panel-width');
      return;
    }
    document.documentElement.style.setProperty(
      '--canvas-panel-width',
      `${SIDEBAR_PANEL_DESKTOP_WIDTH_PX}px`
    );
    return () => {
      document.documentElement.style.removeProperty('--canvas-panel-width');
    };
  }, [isOpen, isDesktop]);

  const [phase, setPhase] = useState<SheetPhase>(isOpen ? 'entering' : 'closed');
  // Content stays mounted from the first `open` until the sheet is gone, so a
  // reopen while it slides out does not blank it.
  const [hasContent, setHasContent] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isDesktop) {
      if (isOpen) setPhase('entering');
      else if (phase !== 'closed') setPhase('closing');
    }
  }
  // Desktop has no slide: the phase mirrors `isOpen`, so crossing the
  // breakpoint later never puts a half-finished sheet in the flow.
  if (isDesktop && (phase !== (isOpen ? 'open' : 'closed') || hasContent !== isOpen)) {
    setPhase(isOpen ? 'open' : 'closed');
    setHasContent(isOpen);
  }

  // The editor clears the section (and title) in the same render that closes
  // the panel; the sheet slides out with what it showed while open.
  const [shown, setShown] = useState({ children, title });
  if (isOpen && (shown.children !== children || shown.title !== title)) {
    setShown({ children, title });
  }
  const sheetChildren = isOpen ? children : shown.children;
  const sheetTitle = isOpen ? title : shown.title;

  const finishEnter = useCallback(() => {
    setPhase((p) => (p === 'entering' ? 'open' : p));
    setHasContent(true);
  }, []);
  // Also the hook-in for a drag that already carried the sheet off-screen.
  const finishClose = useCallback(() => {
    setPhase('closed');
    setHasContent(false);
  }, []);

  useEffect(() => {
    if (isDesktop || (phase !== 'entering' && phase !== 'closing')) return;
    const t = window.setTimeout(
      phase === 'entering' ? finishEnter : finishClose,
      SHEET_TRANSITION_FALLBACK_MS
    );
    return () => window.clearTimeout(t);
  }, [isDesktop, phase, finishEnter, finishClose]);

  const { handleRef, sheetRef } = useMobileSheet({
    isOpen: isOpen && !isDesktop,
    onClose: onClose || (() => {}),
    threshold: 100,
    velocityThreshold: 0.5,
  });

  // A snap-back leaves the drag hook's inline transition on the section; it
  // would override the phase transition from canvas-editor.css.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (sheet && (phase === 'entering' || phase === 'closing')) sheet.style.transition = '';
  }, [phase, sheetRef]);

  if (!isDesktop) {
    if (phase === 'closed') return null;
    // Mobiles Sheet: liegt im Fluss zwischen Canvas und Leiste (order-1), der
    // Canvas darüber schrumpft und bleibt sichtbar. Jedes Sheet hat denselben
    // Aufbau: Griff, Titel mit Schließen, dann der Inhalt des Bereichs.
    return (
      <section
        ref={sheetRef}
        aria-label={sheetTitle}
        data-state={phase}
        inert={phase === 'closing'}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
          if (phase === 'entering') finishEnter();
          else if (phase === 'closing') finishClose();
        }}
        className="sidebar-panel order-1 flex-none flex flex-col h-[clamp(300px,48dvh,420px)] bg-[var(--editor-surface)] rounded-t-[20px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] overflow-hidden"
      >
        <div
          ref={handleRef}
          className="sidebar-panel__drag-handle flex-none h-5 -mb-1 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-9 h-1 rounded-sm bg-[var(--editor-border-strong)]" />
        </div>
        <div className="flex-none h-8 px-5 flex items-center justify-between gap-3">
          <h2 className="m-0 text-[17px] font-bold text-[var(--editor-text)] truncate">
            {sheetTitle}
          </h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={`${sheetTitle ?? 'Bereich'} schließen`}
              className="flex-none size-8 max-canvas-mobile:size-11 rounded-full border-none bg-[var(--editor-tile)] text-[var(--editor-text-secondary)] flex items-center justify-center cursor-pointer"
            >
              <PiX size={16} />
            </button>
          )}
        </div>
        <div
          className={cn(
            'sidebar-panel__content flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-5 flex flex-col gap-4',
            hasContent && 'sidebar-panel__content--in'
          )}
        >
          {hasContent && sheetChildren}
        </div>
      </section>
    );
  }

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'sidebar-panel fixed bg-[var(--editor-surface)] flex flex-col z-[101]',
        'top-[var(--editor-topbar-height)] bottom-0 right-auto w-[348px] max-w-[348px] min-w-0 overflow-visible border-r border-[var(--editor-border)]',
        'left-[calc(var(--canvas-host-inset-left,0px)_+_var(--image-studio-tab-bar-width,76px))]'
      )}
    >
      <div className="sidebar-panel__content flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3 flex flex-col gap-3">
        {children}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Panel einklappen"
          title="Panel einklappen"
          className="absolute top-1/2 -right-[13px] -translate-y-1/2 flex items-center justify-center w-[26px] h-[52px] rounded-r-lg border border-l-0 border-[var(--editor-border-soft)] bg-[var(--editor-surface)] text-[var(--editor-text-muted)] shadow-[2px_0_6px_rgba(0,0,0,0.05)] cursor-pointer transition-colors duration-150 hover:text-[var(--editor-active-fg)]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9.5 3 5 8l4.5 5" />
          </svg>
        </button>
      )}
    </div>
  );
}
