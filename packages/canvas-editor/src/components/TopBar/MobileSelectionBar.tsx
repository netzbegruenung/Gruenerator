import React from 'react';
import { PiCheckBold, PiSlidersHorizontal } from 'react-icons/pi';

import { HIDDEN_SCROLLBAR } from '../../sidebar/sidebarStyles';
import { useCanvasStoreSelector } from '../../stores/CanvasStoreProvider';
import { cn } from '../../utils/cn';

import { ContextControls, type ContextControlsProps } from './ContextControls';

interface MobileSelectionBarProps extends ContextControlsProps {
  /** Öffnet den Bereich der Auswahl als Sheet; fehlt, wenn es keinen gibt. */
  onOpenArea?: () => void;
  onDone: () => void;
}

/**
 * MobileSelectionBar — mobil die untere Leiste, solange etwas ausgewählt ist
 * und kein Sheet offen ist. Sie steht im Slot der Bereichs-Leiste (gleiche
 * Höhe, `order-2`), die Fläche behält also ihre Größe. Formatierung liegt hier,
 * Duplizieren und Löschen in der Pille am Objekt (`MobileSelectionPill`).
 */
export function MobileSelectionBar({ onOpenArea, onDone, ...controls }: MobileSelectionBarProps) {
  const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);

  return (
    <div
      role="toolbar"
      aria-label="Auswahl bearbeiten"
      data-suppress-feedback-launcher=""
      className="order-2 flex-none flex items-center gap-1 h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] pl-3 pr-2 bg-[var(--editor-surface)] border-t border-[var(--editor-border)]"
    >
      <div
        className={cn('flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto', HIDDEN_SCROLLBAR)}
      >
        {!hasPendingAiSuggestion && <ContextControls {...controls} hideObjectActions />}
      </div>
      {onOpenArea && (
        <button
          type="button"
          onClick={onOpenArea}
          className="flex-none inline-flex flex-col items-center justify-center gap-0.5 min-w-11 h-11 px-1 rounded-lg border-none bg-transparent cursor-pointer text-[var(--editor-text-secondary)] hover:bg-[var(--editor-surface-hover)]"
        >
          <PiSlidersHorizontal size={20} aria-hidden />
          <span className="text-[11px] font-bold">Mehr</span>
        </button>
      )}
      <button
        type="button"
        onClick={onDone}
        aria-label="Fertig"
        title="Fertig"
        className="flex-none inline-flex items-center justify-center size-11 rounded-full border-none cursor-pointer bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]"
      >
        <PiCheckBold size={20} aria-hidden />
      </button>
    </div>
  );
}
