// SPDX-License-Identifier: MPL-2.0
import React from 'react';
import { PiFlipHorizontal, PiFlipVertical } from 'react-icons/pi';

import {
  FloatingPositionControl,
  type PositionCommandId,
} from '@ggraphic/editor/components/TopBar/modules/FloatingPositionControl';
import { useRovingToolbar } from '@ggraphic/editor/hooks/useRovingToolbar';
import {
  CANVAS_COMMANDS,
  ariaShortcut,
  formatShortcut,
  isMacPlatform,
  shortcutOf,
  type CanvasCommandId,
} from '@ggraphic/editor/utils/canvasCommandRegistry';

import { ContextCard } from './ContextToolbar.js';

export interface MultiSelectionToolbarProps {
  count: number;
  /** Mindestens ein Element lässt sich verschieben; gesperrte bleiben beim Ausrichten stehen. */
  canAlign: boolean;
  canDistribute: boolean;
  /** Jedes Element lässt sich drehen; die Auswahl spiegelt an ihrer Mitte. */
  canFlip: boolean;
  onFlip: (axis: 'x' | 'y') => void;
  onCommand: (id: PositionCommandId) => void;
}

const ICON_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed aria-pressed:bg-[var(--editor-active-bg)] aria-pressed:text-[var(--editor-active-fg)]';

const SEP = 'w-px h-[22px] bg-[var(--editor-border-soft)] mx-1 shrink-0';

/** „Kopieren (⌘C)“ — Name und Kürzel aus dem Befehlsregister. */
function withShortcut(id: CanvasCommandId): string {
  const shortcut = shortcutOf(id);
  const label = CANVAS_COMMANDS[id].label;
  return shortcut ? `${label} (${formatShortcut(shortcut, isMacPlatform())})` : label;
}

/** `Shift+H` für `aria-keyshortcuts`. */
function ariaOf(id: 'flipHorizontal' | 'flipVertical'): string {
  return ariaShortcut(shortcutOf(id)!, isMacPlatform());
}

/**
 * Die Desktop-Leiste einer Mehrfachauswahl. Formatieren gibt es hier nicht —
 * jede Elementart deutet Farbe und Größe anders —, nur Spiegeln und Position.
 * Kopieren, Duplizieren, Sperren und Löschen stehen wie bei einem einzelnen
 * Element in der Pille über der Auswahl (`SelectionPill`).
 */
export function MultiSelectionToolbar({
  count,
  canAlign,
  canDistribute,
  canFlip,
  onFlip,
  onCommand,
}: MultiSelectionToolbarProps) {
  const roving = useRovingToolbar<HTMLDivElement>();
  return (
    <ContextCard>
      <div
        {...roving}
        role="toolbar"
        aria-label={`${count} Elemente`}
        className="flex items-center gap-0.5"
      >
        <span className="px-2 text-[13px] font-medium text-[var(--editor-text-secondary)] whitespace-nowrap">
          {count} Elemente
        </span>
        {(canFlip || canAlign) && <div className={SEP} />}
        {canFlip && (
          <>
            <button
              type="button"
              className={ICON_BTN}
              onClick={() => onFlip('x')}
              title={withShortcut('flipHorizontal')}
              aria-label={withShortcut('flipHorizontal')}
              aria-keyshortcuts={ariaOf('flipHorizontal')}
            >
              <PiFlipHorizontal size={18} />
            </button>
            <button
              type="button"
              className={ICON_BTN}
              onClick={() => onFlip('y')}
              title={withShortcut('flipVertical')}
              aria-label={withShortcut('flipVertical')}
              aria-keyshortcuts={ariaOf('flipVertical')}
            >
              <PiFlipVertical size={18} />
            </button>
          </>
        )}
        {canAlign && (
          <FloatingPositionControl canDistribute={canDistribute} onCommand={onCommand} />
        )}
      </div>
    </ContextCard>
  );
}
