// SPDX-License-Identifier: MPL-2.0
import { useMobileSheet } from '@ggraphic/editor/hooks/useMobileSheet';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { cn } from '@ggraphic/editor/utils/cn';
import { isFocusLost, isKeyboardModality } from '@ggraphic/editor/utils/editorFocus';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PiX } from 'react-icons/pi';

import { useIsCanvasMobile } from '@ggraphic/editor/hooks/useIsCanvasMobile';

import { SIDEBAR_PANEL_ID } from '@ggraphic/editor/sidebar/sidebarStyles';

import type { SidebarPanelProps } from '@ggraphic/editor/sidebar/types';

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

/** Die Tabs, die diesen Bereich öffnen (`SidebarTabBar`). */
const PANEL_TAB = `[aria-controls="${SIDEBAR_PANEL_ID}"]`;
const TABBABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const FOCUS_RING =
  'outline-none kbd:focus-visible:outline-2 kbd:focus-visible:outline-solid kbd:focus-visible:-outline-offset-2 kbd:focus-visible:outline-[var(--editor-accent)]';

export function SidebarPanel({ isOpen, title, children, onClose }: ExtendedSidebarPanelProps) {
  const t = useMessages();
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

  const { handleRef, sheetRef, contentRef } = useMobileSheet({
    isOpen: isOpen && !isDesktop,
    onClose: onClose || (() => {}),
    // The drag already carried the sheet off-screen: drop it without a second exit.
    onDragClosed: finishClose,
    // A tab switch during the drag's slide-out must not close the new tab.
    closeKey: title ?? null,
    threshold: 100,
    velocityThreshold: 0.5,
  });

  // A snap-back leaves the drag hook's inline transition on the section; it
  // would override the phase transition from canvas-editor.css.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (sheet && (phase === 'entering' || phase === 'closing')) sheet.style.transition = '';
  }, [phase, sheetRef]);

  // Where the sheet rests in the flow, as a distance from the layout's bottom
  // edge. A closing sheet leaves the flow there (absolute), so the canvas
  // above grows and refits at once while the sheet slides out over it.
  // Measured from offset boxes, which ignore the slide/drag transform, and
  // already while entering: a close before the slide-in ends needs it too.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (isDesktop || (phase !== 'open' && phase !== 'entering') || !sheet) return;
    const measure = () => {
      const layout = sheet.closest<HTMLElement>('.canvas-editor-layout');
      // The layout root is the containing block on mobile (max-canvas-mobile:relative).
      if (!layout || sheet.offsetParent !== layout) return;
      const rest = layout.clientHeight - (sheet.offsetTop + sheet.offsetHeight);
      sheet.style.setProperty('--sheet-rest-bottom', `${Math.max(0, rest)}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isDesktop, phase, sheetRef]);

  // Like a dialog: focus goes back to what opened the sheet (its tab) once the
  // sheet is gone — `inert` during the slide-out blurs whatever had focus inside
  // it, which would otherwise drop focus to <body>. The opener follows tab
  // switches: the last element focused outside the sheet while it is up.
  const openerRef = useRef<HTMLElement | null>(null);
  const isUp = !isDesktop && phase !== 'closed';
  useEffect(() => {
    if (!isUp) return;
    const remember = (el: EventTarget | null) => {
      if (el instanceof HTMLElement && el !== document.body && !sheetRef.current?.contains(el)) {
        openerRef.current = el;
      }
    };
    remember(document.activeElement);
    const onFocusIn = (e: FocusEvent) => remember(e.target);
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [isUp, sheetRef]);
  useEffect(() => {
    if (isDesktop || phase !== 'closed') return;
    const opener = openerRef.current;
    openerRef.current = null;
    const active = document.activeElement;
    if (opener?.isConnected && (!active || active === document.body)) opener.focus();
  }, [isDesktop, phase]);

  // Öffnet ein Tab per Tastatur den Bereich (oder wechselt ihn), geht der
  // Fokus hinein: mobil auf die Überschrift, auf dem Desktop auf das erste
  // Bedienelement, solange keines da ist auf den Bereich selbst. Nach einem
  // Klick bleibt er auf dem Tab — sonst schluckte etwa das Suchfeld der
  // Elemente Entf und die Strg-Kürzel, die dem ausgewählten Element gelten.
  // Öffnet ihn die Auswahl auf der Fläche, bleibt der Fokus ohnehin, wo er ist.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelTabRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const active = document.activeElement;
    if (!(active instanceof Element) || !active.closest(PANEL_TAB)) return;
    if (!isKeyboardModality()) return;
    if (!isDesktop) {
      headingRef.current?.focus();
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(`.sidebar-panel__content :is(${TABBABLE})`);
    (first ?? panel).focus();
  }, [isOpen, title, isDesktop]);

  // Desktop: zu wird der Bereich über seinen Tab, „Panel einklappen" oder von
  // aussen. Ging der Fokus dabei mit dem Bereich verloren, bekommt ihn der Tab,
  // der ihn zuletzt offen zeigte. Mobil erledigt das der Rückweg zum Öffner oben.
  useEffect(() => {
    if (!isDesktop) return;
    if (isOpen) {
      const scope: ParentNode = panelRef.current?.closest('.canvas-editor-layout') ?? document;
      panelTabRef.current = scope.querySelector<HTMLElement>(`${PANEL_TAB}[aria-expanded="true"]`);
      return;
    }
    const tab = panelTabRef.current;
    panelTabRef.current = null;
    if (tab?.isConnected && isFocusLost()) tab.focus();
  }, [isOpen, title, isDesktop]);

  if (!isDesktop) {
    if (phase === 'closed') return null;
    // Mobiles Sheet: liegt im Fluss zwischen Canvas und Leiste (order-1), der
    // Canvas darüber schrumpft und bleibt sichtbar. Beim Schließen verlässt es
    // den Fluss (absolute, an seinem Ruheplatz), damit der Canvas sofort wächst.
    // Jedes Sheet hat denselben Aufbau: Griff, Titel mit Schließen, dann der
    // Inhalt des Bereichs.
    return (
      <section
        ref={sheetRef}
        id={SIDEBAR_PANEL_ID}
        aria-label={sheetTitle}
        data-state={phase}
        inert={phase === 'closing'}
        onTransitionEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
          if (phase === 'entering') finishEnter();
          else if (phase === 'closing') finishClose();
        }}
        className={cn(
          'sidebar-panel order-1 flex-none flex flex-col h-[clamp(300px,48dvh,420px)] bg-[var(--editor-surface)] rounded-t-[20px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] overflow-hidden',
          phase === 'closing' && 'absolute inset-x-0 bottom-[var(--sheet-rest-bottom,0px)] z-[100]'
        )}
      >
        {/* Griff und Titelzeile ziehen das Sheet gemeinsam. */}
        <div ref={handleRef} className="flex-none touch-none">
          <div className="sidebar-panel__drag-handle h-5 -mb-1 flex items-center justify-center cursor-grab active:cursor-grabbing">
            <div className="w-9 h-1 rounded-sm bg-[var(--editor-border-strong)]" />
          </div>
          <div className="h-8 max-canvas-mobile:h-11 px-5 flex items-center justify-between gap-3">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className={cn(
                'm-0 text-[17px] font-bold text-[var(--editor-text)] truncate',
                FOCUS_RING
              )}
            >
              {sheetTitle}
            </h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t.ui.closeSection(sheetTitle ?? null)}
                className="flex-none size-8 max-canvas-mobile:size-11 rounded-full border-none bg-[var(--editor-tile)] text-[var(--editor-text-secondary)] flex items-center justify-center cursor-pointer"
              >
                <PiX size={16} />
              </button>
            )}
          </div>
        </div>
        <div
          ref={contentRef}
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
      ref={panelRef}
      id={SIDEBAR_PANEL_ID}
      role="region"
      aria-label={title}
      tabIndex={-1}
      className={cn(
        FOCUS_RING,
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
          aria-label={t.ui.collapsePanel}
          title={t.ui.collapsePanel}
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
