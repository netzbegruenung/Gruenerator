import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PiCopy, PiDotsThreeBold, PiTrash } from 'react-icons/pi';

import { useIsCanvasTextEditing } from './CanvasTextOverlay';

import type { SelectionBox } from './GenericCanvas';

const PILL_HEIGHT = 44;
const GAP = 12;
const EDGE = 8;
/** Kopfzeile (52 px) plus Luft — darüber rutscht die Pille unter das Objekt. */
const MIN_TOP = 64;

const BTN =
  'inline-flex items-center justify-center size-11 shrink-0 rounded-full border-none bg-transparent cursor-pointer text-[var(--editor-text)] active:bg-[var(--editor-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed';

export interface MobileSelectionPillProps {
  /** Wechselt mit der Auswahl und ihren Daten — Anlass zum Neumessen. */
  measureKey: unknown;
  zoom: number;
  getBox: () => SelectionBox | null;
  subscribeManipulation: (listener: (active: boolean) => void) => () => void;
  canDuplicate: boolean;
  canDelete: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onMore?: () => void;
}

/**
 * MobileSelectionPill — die Aktionen am Objekt (Duplizieren, Löschen, Mehr),
 * wie bei Canva direkt über der Auswahl. Während des Ziehens und
 * Transformierens verschwindet sie und misst danach neu; beim Tippen in einem
 * Text ebenfalls, damit sie nicht über dem Editor liegt.
 */
export function MobileSelectionPill({
  measureKey,
  zoom,
  getBox,
  subscribeManipulation,
  canDuplicate,
  canDelete,
  onDuplicate,
  onDelete,
  onMore,
}: MobileSelectionPillProps) {
  const [box, setBox] = useState<SelectionBox | null>(null);
  const [manipulating, setManipulating] = useState(false);
  const [pillWidth, setPillWidth] = useState(0);
  const pillRef = React.useRef<HTMLDivElement>(null);
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
  }, [box, canDuplicate, canDelete, onMore]);

  if (manipulating || isEditingText || !box) return null;

  const above = box.top - GAP - PILL_HEIGHT;
  const top = above >= MIN_TOP ? above : box.top + box.height + GAP;
  const centered = box.left + box.width / 2 - pillWidth / 2;
  const left = Math.max(EDGE, Math.min(centered, window.innerWidth - pillWidth - EDGE));

  return createPortal(
    <div
      ref={pillRef}
      role="toolbar"
      aria-label="Element"
      style={{ top, left }}
      className="fixed z-[110] flex items-center gap-0.5 px-1 rounded-full border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
    >
      <button
        type="button"
        className={BTN}
        onClick={onDuplicate}
        disabled={!canDuplicate}
        aria-label="Duplizieren"
      >
        <PiCopy size={20} aria-hidden />
      </button>
      <button
        type="button"
        className={BTN}
        onClick={onDelete}
        disabled={!canDelete}
        aria-label="Löschen"
      >
        <PiTrash size={20} aria-hidden />
      </button>
      {onMore && (
        <button type="button" className={BTN} onClick={onMore} aria-label="Mehr Optionen">
          <PiDotsThreeBold size={20} aria-hidden />
        </button>
      )}
    </div>,
    document.body
  );
}
