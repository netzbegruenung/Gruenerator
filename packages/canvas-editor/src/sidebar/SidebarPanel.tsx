import { useEffect } from 'react';
import { PiX } from 'react-icons/pi';

import { useIsCanvasMobile } from '../hooks/useIsCanvasMobile';
import { useMobileSheet } from '../hooks/useMobileSheet';

import type { SidebarPanelProps } from './types';

import { cn } from '../utils/cn';

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

  const { handleRef, isDragging, translateY } = useMobileSheet({
    isOpen: isOpen && !isDesktop,
    onClose: onClose || (() => {}),
    threshold: 100,
    velocityThreshold: 0.5,
  });

  if (!isOpen) return null;

  if (!isDesktop) {
    // Mobiles Sheet: liegt im Fluss zwischen Canvas und Leiste (order-1), der
    // Canvas darüber schrumpft und bleibt sichtbar. Jedes Sheet hat denselben
    // Aufbau: Griff, Titel mit Schließen, dann der Inhalt des Bereichs.
    return (
      <section
        aria-label={title}
        className="sidebar-panel order-1 flex-none flex flex-col h-[clamp(300px,48dvh,420px)] bg-[var(--editor-surface)] rounded-t-[20px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] overflow-hidden"
        style={
          isDragging ? { transform: `translateY(${translateY}px)`, transition: 'none' } : undefined
        }
      >
        <div
          ref={handleRef}
          className="sidebar-panel__drag-handle flex-none h-5 -mb-1 flex items-center justify-center cursor-grab active:cursor-grabbing"
        >
          <div className="w-9 h-1 rounded-sm bg-[var(--editor-border-strong)]" />
        </div>
        <div className="flex-none h-8 px-5 flex items-center justify-between gap-3">
          <h2 className="m-0 text-[17px] font-bold text-[var(--editor-text)] truncate">{title}</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={`${title ?? 'Bereich'} schließen`}
              className="flex-none size-8 rounded-full border-none bg-[var(--editor-tile)] text-[var(--editor-text-secondary)] flex items-center justify-center cursor-pointer"
            >
              <PiX size={16} />
            </button>
          )}
        </div>
        <div className="sidebar-panel__content flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-5 flex flex-col gap-4">
          {children}
        </div>
      </section>
    );
  }

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
