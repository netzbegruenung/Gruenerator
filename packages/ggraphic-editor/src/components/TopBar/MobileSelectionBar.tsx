// SPDX-License-Identifier: MPL-2.0
import React from 'react';
import { PiCheckBold, PiSlidersHorizontal } from 'react-icons/pi';

import { BarTilesProvider } from '@ggraphic/editor/components/TopBar/barTiles';
import {
  ContextControls,
  showsCropModeBar,
  type ContextControlsProps,
} from '@ggraphic/editor/components/TopBar/ContextControls';
import {
  TOOLBAR_ITEMS_WITH_INPUTS,
  useRovingToolbar,
} from '@ggraphic/editor/hooks/useRovingToolbar';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { HIDDEN_SCROLLBAR } from '@ggraphic/editor/sidebar/sidebarStyles';
import { useCanvasStoreSelector } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { cn } from '@ggraphic/editor/utils/cn';

interface MobileSelectionBarProps extends ContextControlsProps {
  /** Öffnet den Bereich der Auswahl als Sheet; fehlt, wenn es keinen gibt. */
  onOpenArea?: () => void;
  onDone: () => void;
}

/**
 * MobileSelectionBar — mobil die untere Leiste, solange etwas ausgewählt ist
 * und kein Sheet offen ist. Sie steht im Slot der Bereichs-Leiste (gleiche
 * Höhe, `order-2`), die Fläche behält also ihre Größe. Formatierung liegt hier,
 * Duplizieren, Löschen und das Menü „…“ in der Pille am Objekt (`SelectionPill`).
 * Die Werkzeuge stehen als beschriftete Kacheln (`barTiles`).
 */
export function MobileSelectionBar({ onOpenArea, onDone, ...controls }: MobileSelectionBarProps) {
  const t = useMessages();
  const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);
  // Im Zuschneide-Modus hat die Leiste ihre eigenen Ausgänge (Abbrechen, Fertig).
  const cropping = showsCropModeBar(controls) && !hasPendingAiSuggestion;
  const roving = useRovingToolbar<HTMLDivElement>(TOOLBAR_ITEMS_WITH_INPUTS);

  return (
    <div
      {...roving}
      role="toolbar"
      aria-label={t.topBar.editSelection}
      data-suppress-feedback-launcher=""
      className={cn(
        'order-2 flex-none flex gap-1 pl-3 pr-2 bg-[var(--editor-surface)] border-t border-[var(--editor-border)]',
        cropping
          ? 'flex-col py-2 pb-[calc(8px+env(safe-area-inset-bottom))]'
          : 'items-center h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)]'
      )}
    >
      {cropping ? (
        // Die Zuschneide-Leiste ordnet sich selbst: Ausgänge fest, nur die Werkzeuge scrollen.
        <ContextControls {...controls} hideObjectActions cropLayout="mobile" />
      ) : (
        <div
          className={cn(
            'canvas-scroll-fade-x flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto',
            HIDDEN_SCROLLBAR
          )}
        >
          {!hasPendingAiSuggestion && (
            <BarTilesProvider>
              <ContextControls {...controls} hideObjectActions />
            </BarTilesProvider>
          )}
        </div>
      )}
      {onOpenArea && !cropping && (
        <button
          type="button"
          onClick={onOpenArea}
          className="flex-none inline-flex flex-col items-center justify-center gap-0.5 min-w-11 h-11 px-1 rounded-lg border-none bg-transparent cursor-pointer text-[var(--editor-text-secondary)] hover:bg-[var(--editor-surface-hover)]"
        >
          <PiSlidersHorizontal size={20} aria-hidden />
          <span className="text-[11px] font-bold">Mehr</span>
        </button>
      )}
      {!cropping && (
        <button
          type="button"
          onClick={onDone}
          aria-label={t.topBar.done}
          title={t.topBar.done}
          className="flex-none inline-flex items-center justify-center size-11 rounded-full border-none cursor-pointer bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]"
        >
          <PiCheckBold size={20} aria-hidden />
        </button>
      )}
    </div>
  );
}
