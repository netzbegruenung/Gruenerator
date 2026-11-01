// SPDX-License-Identifier: MPL-2.0
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PiCopy,
  PiDotsThreeBold,
  PiFlipHorizontal,
  PiFlipVertical,
  PiLockSimple,
  PiLockSimpleOpen,
  PiTrash,
} from 'react-icons/pi';

import { useIsCanvasTextEditing } from '@ggraphic/editor/components/CanvasTextOverlay';
import { useRovingToolbar } from '@ggraphic/editor/hooks/useRovingToolbar';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import {
  CANVAS_COMMANDS,
  formatShortcut,
  isMacPlatform,
  shortcutOf,
} from '@ggraphic/editor/utils/canvasCommandRegistry';
import { cn } from '@ggraphic/editor/utils/cn';

import type { SelectionBox } from '@ggraphic/editor/components/GenericCanvas';

/**
 * Finger (`touch`) oder Maus (`pointer`). Am Desktop ist die Pille kleiner und
 * hält Abstand zur Kontextleiste, die oben über der Fläche schwebt.
 */
export type SelectionPillVariant = 'touch' | 'pointer';

const GAP = 12;
const EDGE = 8;
const GEOMETRY: Record<SelectionPillVariant, { height: number; minTop: (top: number) => number }> =
  {
    // Kopfzeile (52 px) plus Luft — darüber rutscht die Pille unter das Objekt.
    touch: { height: 44, minTop: (top) => Math.max(64, top + EDGE) },
    // Das Band der Kontextleiste (`h-14` im Layout) liegt über der Fläche.
    pointer: { height: 36, minTop: (top) => top + 56 + EDGE },
  };

const BTN: Record<SelectionPillVariant, string> = {
  touch:
    'inline-flex items-center justify-center size-11 shrink-0 rounded-full border-none bg-transparent cursor-pointer text-[var(--editor-text)] active:bg-[var(--editor-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed',
  pointer:
    'inline-flex items-center justify-center size-8 shrink-0 rounded-full border-none bg-transparent cursor-pointer text-[var(--editor-text)] transition-colors duration-150 hover:enabled:bg-[var(--editor-surface-hover)] hover:enabled:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed aria-pressed:bg-[var(--editor-active-bg)] aria-pressed:text-[var(--editor-active-fg)]',
};

const DANGER_BTN =
  'hover:enabled:bg-[var(--editor-danger-bg)] hover:enabled:text-[var(--editor-danger-fg)]';

export interface SelectionPillProps {
  variant?: SelectionPillVariant;
  /** Wechselt mit der Auswahl und ihren Daten — Anlass zum Neumessen. */
  measureKey: unknown;
  zoom: number;
  getBox: () => SelectionBox | null;
  subscribeManipulation: (listener: (active: boolean) => void) => () => void;
  canDuplicate: boolean;
  canDelete: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Touch: öffnet den Bereich der Auswahl. Pointer: das Kontextmenü, am Knopf verankert. */
  onMore?: (anchor: HTMLElement) => void;
  isLocked?: boolean;
  /**
   * Touch: steht statt Löschen da, solange gesperrt ist. Pointer: ein eigener
   * Knopf Sperren/Entsperren, sobald sich die Auswahl sperren lässt.
   */
  onToggleLock?: () => void;
  /**
   * Spiegeln — nur am Handy für die Mehrfachauswahl: dort gibt es dafür weder
   * Leiste noch Kontextmenü. Ein einzelnes Element spiegelt im Drehen-Popover,
   * am Desktop trägt die Leiste der Mehrfachauswahl das Spiegeln.
   */
  onFlip?: (axis: 'x' | 'y') => void;
  /** Mehrere Elemente: andere Begründung, wenn nichts davon gelöscht werden kann. */
  isMulti?: boolean;
}

/**
 * Lage der Pille in Fenster-px: über der Auswahl, sonst darunter, sonst in der
 * Auswahl an ihrer Unterkante. Gemessen wird am sichtbaren Teil der
 * Seitenfläche (`box.visible`), nicht am Fenster — darunter liegt am Handy die
 * Auswahl-Leiste. Die Pille wirkt nicht auf den Drehgriff zurück: er wählt
 * seine Seite allein, sie weicht ihm aus (`getSelectionBox`).
 */
export function placePill(
  box: SelectionBox,
  pillWidth: number,
  variant: SelectionPillVariant = 'touch'
): { top: number; left: number } {
  const { visible } = box;
  const { height, minTop: minTopFor } = GEOMETRY[variant];
  const minTop = minTopFor(visible.top);
  const maxTop = visible.bottom - EDGE - height;
  const centered = box.left + box.width / 2 - pillWidth / 2;
  const left = Math.max(visible.left + EDGE, Math.min(centered, visible.right - pillWidth - EDGE));
  const bottom = box.top + box.height;
  const above = box.top - GAP - height;
  const below = bottom + GAP;
  if (above >= minTop) return { top: above, left };
  if (below <= maxTop) return { top: below, left };
  // In der Auswahl: über ihrer Unterkante und über jedem Drehgriff, der unter der Pille läge.
  let floor = Math.min(bottom, visible.bottom);
  for (const r of box.rotaters) {
    if (r.top > box.top && r.left < left + pillWidth && r.right > left)
      floor = Math.min(floor, r.top);
  }
  // Zu wenig Platz für beides: lieber unter die Kopfzeile als auf die Auswahl-Leiste.
  return { top: Math.min(maxTop, Math.max(minTop, floor - GAP - height)), left };
}

/**
 * SelectionPill — die Aktionen am Objekt (Duplizieren, Löschen, Mehr), wie bei
 * Canva direkt über der Auswahl; am Desktop dazu Sperren. Was die Auswahl
 * gestaltet, steht in der Kontextleiste, was sie als Ganzes betrifft, hier.
 * Während des Ziehens und Transformierens verschwindet sie und misst danach
 * neu; beim Tippen in einem Text ebenfalls, damit sie nicht über dem Editor liegt.
 */
export function SelectionPill({
  variant = 'touch',
  measureKey,
  zoom,
  getBox,
  subscribeManipulation,
  canDuplicate,
  canDelete,
  onDuplicate,
  onDelete,
  onMore,
  isLocked = false,
  onToggleLock,
  onFlip,
  isMulti = false,
}: SelectionPillProps) {
  const t = useMessages();
  const [box, setBox] = useState<SelectionBox | null>(null);
  const [manipulating, setManipulating] = useState(false);
  const [pillWidth, setPillWidth] = useState(0);
  const { ref: pillRef, onKeyDown, onFocus } = useRovingToolbar<HTMLDivElement>();
  const isEditingText = useIsCanvasTextEditing();

  useLayoutEffect(() => {
    if (manipulating) return undefined;
    let frame = requestAnimationFrame(() => setBox(getBox()));
    const remeasure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBox(getBox()));
    };
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    // Die Fläche skaliert animiert zurück, wenn ein Sheet schließt
    // (`useMobileSheetFit`) — erst danach stimmt die Box.
    window.addEventListener('transitionend', remeasure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('transitionend', remeasure, true);
    };
  }, [getBox, measureKey, zoom, manipulating]);

  useEffect(() => subscribeManipulation(setManipulating), [subscribeManipulation]);

  useLayoutEffect(() => {
    if (pillRef.current) setPillWidth(pillRef.current.offsetWidth);
  }, [box, canDuplicate, canDelete, onMore, isLocked, onToggleLock, onFlip, pillRef]);

  if (manipulating || isEditingText || !box) return null;

  const { top, left } = placePill(box, pillWidth, variant);
  const pointer = variant === 'pointer';
  const btn = BTN[variant];
  const iconSize = pointer ? 18 : 20;
  const lockLabel = isLocked ? 'Entsperren' : 'Sperren';
  // Am Desktop stehen Gründe im Tooltip: ein ausgegrauter Knopf soll sagen, warum.
  const deleteTitle = canDelete
    ? t.topBar.deleteWithShortcut(formatShortcut(shortcutOf('delete')!, isMacPlatform()))
    : isLocked
      ? t.topBar.lockedNoDelete
      : isMulti
        ? t.topBar.nothingDeletable
        : t.topBar.templateNoDelete;

  const deleteButton = (
    <button
      type="button"
      className={cn(btn, pointer && DANGER_BTN)}
      onClick={onDelete}
      disabled={!canDelete}
      title={pointer ? deleteTitle : undefined}
      aria-label="Löschen"
    >
      <PiTrash size={iconSize} aria-hidden />
    </button>
  );

  return createPortal(
    <div
      ref={pillRef}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      role="toolbar"
      aria-label="Element"
      style={{ top, left }}
      className={cn(
        'fixed z-[110] flex items-center gap-0.5 rounded-full border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]',
        pointer ? 'p-0.5' : 'px-1'
      )}
    >
      {pointer && onToggleLock && (
        <button
          type="button"
          className={btn}
          onClick={onToggleLock}
          aria-pressed={isLocked}
          title={isLocked ? t.topBar.unlockHint : t.topBar.lockHint}
          aria-label={lockLabel}
        >
          {isLocked ? (
            <PiLockSimple size={iconSize} aria-hidden />
          ) : (
            <PiLockSimpleOpen size={iconSize} aria-hidden />
          )}
        </button>
      )}
      <button
        type="button"
        className={btn}
        onClick={onDuplicate}
        disabled={!canDuplicate}
        title={
          pointer ? (canDuplicate ? t.topBar.duplicate : t.topBar.templateNoDuplicate) : undefined
        }
        aria-label="Duplizieren"
      >
        <PiCopy size={iconSize} aria-hidden />
      </button>
      {pointer ? (
        deleteButton
      ) : isLocked && onToggleLock ? (
        <button type="button" className={btn} onClick={onToggleLock} aria-label="Entsperren">
          <PiLockSimpleOpen size={iconSize} aria-hidden />
        </button>
      ) : (
        deleteButton
      )}
      {onFlip && (
        <>
          <button
            type="button"
            className={btn}
            onClick={() => onFlip('x')}
            aria-label={CANVAS_COMMANDS.flipHorizontal.label}
          >
            <PiFlipHorizontal size={iconSize} aria-hidden />
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => onFlip('y')}
            aria-label={CANVAS_COMMANDS.flipVertical.label}
          >
            <PiFlipVertical size={iconSize} aria-hidden />
          </button>
        </>
      )}
      {onMore && (
        <button
          type="button"
          className={btn}
          onClick={(e) => onMore(e.currentTarget)}
          aria-haspopup={pointer ? 'menu' : undefined}
          title={pointer ? 'Mehr Optionen' : undefined}
          aria-label="Mehr Optionen"
        >
          <PiDotsThreeBold size={iconSize} aria-hidden />
        </button>
      )}
    </div>,
    document.body
  );
}
