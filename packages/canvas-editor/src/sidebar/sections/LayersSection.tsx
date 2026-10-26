/**
 * „Ebenen": jedes Element der aktiven Seite als Eintrag, vorderstes zuerst —
 * der Weg zu allem auf der Fläche ohne Maus und für Screenreader (#4953).
 *
 * Eine Listbox mit Mehrfachauswahl und rovingem Tabindex. Die Auswahl folgt
 * dem Fokus: Pfeil hoch/runter, Pos1 und Ende wählen den Eintrag allein aus;
 * Umschalt+Pfeil nimmt dazu, Strg/⌘+Pfeil bewegt nur den Fokus, Leertaste
 * (oder Strg/⌘-Klick) schaltet um, Umschalt+Leertaste wählt bis dorthin.
 * Enter und F2 bearbeiten einen Text bzw. setzen ein Bild in einen Rahmen.
 * Entf, Strg+C/X/V/D/A und Alt+Pfeil laufen weiter über die Tastatur der
 * Seite (`hooks/useCanvasKeyboardHandlers.ts`, Regel R1).
 */

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';

import { cn } from '../../utils/cn';

import type { LayerEntry } from '../../utils/layerLabels';
import type { LayerSelectionChange } from '../../utils/layerSelection';

export interface LayersSectionProps {
  layers: readonly LayerEntry[];
  selectedIds: readonly string[];
  onSelect: (change: LayerSelectionChange) => void;
  /** Enter oder F2 auf einem Eintrag. */
  onActivate: (id: string) => void;
  /** Der Sprunglink will den Fokus in der Liste: auf die Auswahl, sonst den ersten Eintrag. */
  focusRequested?: boolean;
  onFocusHandled?: () => void;
}

const isMod = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

export function LayersSection({
  layers,
  selectedIds,
  onSelect,
  onActivate,
  focusRequested = false,
  onFocusHandled,
}: LayersSectionProps) {
  const optionRefs = useRef(new Map<string, HTMLDivElement>());
  const emptyRef = useRef<HTMLParagraphElement>(null);
  // Woher Umschalt+Leertaste und Umschalt-Klick einen Bereich aufziehen.
  const anchorRef = useRef<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [hasFocus, setHasFocus] = useState(false);

  const isListed = (id: string | null) => id !== null && layers.some((l) => l.id === id);
  // Der eine Tab-Halt: solange die Liste den Fokus hat, der fokussierte Eintrag;
  // sonst folgt er der Auswahl, auch wenn sie auf der Fläche entstand.
  const stopId =
    (hasFocus && isListed(focusId) ? focusId : null) ??
    layers.find((l) => selectedIds.includes(l.id))?.id ??
    (isListed(focusId) ? focusId : null) ??
    layers[0]?.id ??
    null;

  useEffect(() => {
    if (!focusRequested) return;
    const target = stopId ? optionRefs.current.get(stopId) : emptyRef.current;
    target?.focus();
    onFocusHandled?.();
  }, [focusRequested, stopId, onFocusHandled]);

  const focusAt = (index: number) => {
    const entry = layers[index];
    if (!entry) return null;
    setFocusId(entry.id);
    optionRefs.current.get(entry.id)?.focus();
    return entry.id;
  };

  const select = (change: LayerSelectionChange) => {
    if (change.kind !== 'set') anchorRef.current = change.id;
    onSelect(change);
  };

  const rangeTo = (id: string): string[] => {
    const anchor = anchorRef.current;
    const to = layers.findIndex((l) => l.id === id);
    const from = anchor ? layers.findIndex((l) => l.id === anchor) : -1;
    if (from === -1) return [id];
    const [lo, hi] = from < to ? [from, to] : [to, from];
    return layers.slice(lo, hi + 1).map((l) => l.id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    const id = layers[index]!.id;
    const last = layers.length - 1;
    const target =
      e.key === 'ArrowDown'
        ? Math.min(index + 1, last)
        : e.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;

    if (target !== null) {
      // Alt+Pfeil schiebt das Element (Tastatur der Seite), nicht den Fokus.
      if (e.altKey) return;
      e.preventDefault();
      const next = focusAt(target);
      if (!next || isMod(e)) return;
      if (e.shiftKey) {
        onSelect({ kind: 'set', ids: [...new Set([...selectedIds, next])] });
      } else {
        select({ kind: 'only', id: next });
      }
      return;
    }

    if (e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) onSelect({ kind: 'set', ids: rangeTo(id) });
      else select({ kind: 'toggle', id });
      return;
    }

    if (e.key === 'Enter' || e.key === 'F2') {
      // Die Seite hört auf F2 selbst; hier soll es genau einmal laufen.
      e.preventDefault();
      e.stopPropagation();
      onActivate(id);
    }
  };

  const handleClick = (e: MouseEvent<HTMLDivElement>, id: string) => {
    setFocusId(id);
    if (isMod(e)) select({ kind: 'toggle', id });
    else if (e.shiftKey) onSelect({ kind: 'set', ids: rangeTo(id) });
    else select({ kind: 'only', id });
  };

  return (
    <div className="flex flex-col gap-2 p-sm">
      <p className="m-0 text-[length:var(--font-size-small)] text-[var(--editor-text-secondary)]">
        Oben steht das vorderste Element.
      </p>
      {layers.length === 0 ? (
        <p
          ref={emptyRef}
          tabIndex={-1}
          className="m-0 text-[length:var(--font-size-small)] text-[var(--editor-text-muted)] outline-none"
        >
          Auf dieser Seite liegen keine Elemente.
        </p>
      ) : (
        <div
          role="listbox"
          aria-label="Ebenen"
          aria-multiselectable="true"
          className="flex flex-col gap-0.5"
          onFocus={() => setHasFocus(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHasFocus(false);
          }}
        >
          {layers.map((layer, index) => {
            const selected = selectedIds.includes(layer.id);
            return (
              <div
                key={layer.id}
                ref={(node) => {
                  if (node) optionRefs.current.set(layer.id, node);
                  else optionRefs.current.delete(layer.id);
                }}
                role="option"
                aria-selected={selected}
                tabIndex={layer.id === stopId ? 0 : -1}
                data-layer-id={layer.id}
                onKeyDown={(e) => handleKeyDown(e, index)}
                onFocus={() => setFocusId(layer.id)}
                onClick={(e) => handleClick(e, layer.id)}
                className={cn(
                  'flex min-h-8 cursor-pointer select-none items-center rounded-md px-2 text-[length:var(--font-size-small)] text-[var(--editor-text)] outline-none hover:bg-[var(--editor-surface-hover)] kbd:focus-visible:outline-2 kbd:focus-visible:outline-solid kbd:focus-visible:-outline-offset-2 kbd:focus-visible:outline-[var(--editor-accent)]',
                  selected &&
                    'bg-[var(--editor-active-bg)] font-semibold text-[var(--editor-active-fg)] hover:bg-[var(--editor-active-bg)]'
                )}
              >
                <span className="truncate">{layer.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
