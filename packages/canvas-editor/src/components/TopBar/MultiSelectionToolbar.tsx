import React from 'react';
import {
  PiCopy,
  PiCopySimple,
  PiFlipHorizontal,
  PiFlipVertical,
  PiLockSimple,
  PiLockSimpleOpen,
  PiTrash,
} from 'react-icons/pi';

import {
  CANVAS_COMMANDS,
  ariaShortcut,
  formatShortcut,
  isMacPlatform,
  shortcutOf,
  type CanvasCommandId,
} from '../../utils/canvasCommandRegistry';
import { type LockState } from '../../utils/layerLock';

import { ContextCard } from './ContextToolbar';

export interface MultiSelectionToolbarProps {
  count: number;
  canCopy: boolean;
  canDelete: boolean;
  lockState: LockState;
  canLock: boolean;
  /** Jedes Element lässt sich drehen; die Auswahl spiegelt an ihrer Mitte. */
  canFlip: boolean;
  onFlip: (axis: 'x' | 'y') => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onDeselect: () => void;
}

const ICON_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed aria-pressed:bg-[var(--editor-active-bg)] aria-pressed:text-[var(--editor-active-fg)]';

const DANGER_BTN =
  'inline-flex items-center justify-center size-8 shrink-0 rounded-md border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-danger-bg)] hover:text-[var(--editor-danger-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

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
 * Die Desktop-Leiste einer Mehrfachauswahl. Bisher gab es dafür gar keine:
 * `selectedElement` ist dann null, und alles außer Entf war unerreichbar.
 * Formatieren gibt es hier nicht — jede Elementart deutet Farbe und Größe
 * anders —, nur was für alle gleich geht.
 */
export function MultiSelectionToolbar({
  count,
  canCopy,
  canDelete,
  lockState,
  canLock,
  canFlip,
  onFlip,
  onCopy,
  onDuplicate,
  onToggleLock,
  onDelete,
  onDeselect,
}: MultiSelectionToolbarProps) {
  const locked = lockState === 'all';
  const lockLabel = locked ? 'Entsperren' : 'Sperren';
  return (
    <ContextCard>
      <div role="toolbar" aria-label={`${count} Elemente`} className="flex items-center gap-0.5">
        <span className="px-2 text-[13px] font-medium text-[var(--editor-text-secondary)] whitespace-nowrap">
          {count} Elemente
        </span>
        <div className={SEP} />
        <button
          type="button"
          className={ICON_BTN}
          onClick={onCopy}
          disabled={!canCopy}
          title={withShortcut('copy')}
          aria-label={withShortcut('copy')}
        >
          <PiCopySimple size={18} />
        </button>
        <button
          type="button"
          className={ICON_BTN}
          onClick={onDuplicate}
          disabled={!canCopy}
          title={withShortcut('duplicate')}
          aria-label={withShortcut('duplicate')}
        >
          <PiCopy size={18} />
        </button>
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
        {canLock && (
          <button
            type="button"
            className={ICON_BTN}
            onClick={onToggleLock}
            aria-pressed={locked}
            title={lockLabel}
            aria-label={lockLabel}
          >
            {locked ? <PiLockSimple size={18} /> : <PiLockSimpleOpen size={18} />}
          </button>
        )}
        <button
          type="button"
          className={DANGER_BTN}
          onClick={onDelete}
          disabled={!canDelete}
          title={canDelete ? withShortcut('delete') : 'Nichts davon lässt sich löschen'}
          aria-label={withShortcut('delete')}
        >
          <PiTrash size={18} />
        </button>
        <div className={SEP} />
        <button
          type="button"
          className={ICON_BTN}
          onClick={onDeselect}
          title="Auswahl aufheben (Esc)"
          aria-label="Auswahl aufheben (Esc)"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </ContextCard>
  );
}
