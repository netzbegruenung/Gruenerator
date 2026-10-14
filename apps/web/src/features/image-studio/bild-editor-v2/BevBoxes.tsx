import { Plus, RotateCcw, Trash2, Undo2, X } from 'lucide-react';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
} from 'react';

import { cn } from '../../../utils/cn';

import { BOX_STEP, boxNames, isChanged, isMoved, moveBox, resizeBox } from './boxEdit';
import { type BevBox } from './types';
import { type BildEditorV2 } from './useBildEditorV2';

function boxState(box: BevBox): string {
  if (box.source === null) return 'neu';
  if (box.action === 'remove') return 'wird entfernt';
  if (box.action === 'change') return 'wird ersetzt';
  return isMoved(box) ? 'verschoben' : 'unverändert';
}

/** Largest first, so small elements sit on top and stay clickable. */
function byAreaDesc(a: BevBox, b: BevBox): number {
  const area = (x: BevBox) => (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]);
  return area(b) - area(a);
}

/** Where the menu of a box sits: under it, above it, or inside it when it fills the image. */
function menuPosition([top, left, bottom, right]: BevBox['bbox']): CSSProperties {
  const horizontal =
    left + right < 1000 ? { left: `${left / 10}%` } : { right: `${(1000 - right) / 10}%` };
  if (bottom <= 550) return { ...horizontal, top: `calc(${bottom / 10}% + 6px)` };
  if (top >= 450) return { ...horizontal, bottom: `calc(${(1000 - top) / 10}% + 6px)` };
  return { ...horizontal, bottom: `calc(${(1000 - bottom) / 10}% + 6px)` };
}

interface Drag {
  id: string;
  kind: 'move' | 'resize';
  x: number;
  y: number;
  start: BevBox['bbox'];
}

/** The menu at the selected element: remove it, or say what should be there instead. */
function BoxMenu({ bev, box, name }: { bev: BildEditorV2; box: BevBox; name: string }) {
  const { updateBox, removeAddedBox, setSelectedBoxId } = bev;
  const added = box.source === null;
  const removed = !added && box.action === 'remove';
  useEffect(() => {
    const close = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setSelectedBoxId(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [setSelectedBoxId]);
  const undo = () =>
    updateBox(box.id, { action: 'keep', change: '', ...(box.source && { bbox: box.source }) });

  return (
    <div
      role="group"
      aria-label={name}
      className="absolute z-10 flex w-64 max-w-[calc(100%-12px)] flex-col gap-2 rounded-xl border border-border bg-card p-2.5 text-foreground shadow-xl"
      style={menuPosition(box.bbox)}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{name}</span>
        <button
          type="button"
          onClick={() => setSelectedBoxId(null)}
          aria-label="Schließen"
          className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-grey-100 dark:hover:bg-grey-800"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {removed ? (
        <p className="text-xs text-muted-foreground">Wird beim Anwenden entfernt.</p>
      ) : (
        <input
          type="text"
          value={box.change}
          onChange={(e) =>
            updateBox(box.id, {
              change: e.target.value,
              ...(!added && { action: e.target.value.trim() ? 'change' : 'keep' }),
            })
          }
          placeholder={added ? 'Was soll hier entstehen?' : 'Ersetzen durch …'}
          aria-label={added ? 'Was soll hier entstehen?' : 'Ersetzen durch'}
          className="h-9 rounded-lg border border-border bg-transparent px-2.5 text-sm"
        />
      )}
      <div className="flex flex-wrap gap-1.5">
        {added ? (
          <button
            type="button"
            onClick={() => removeAddedBox(box.id)}
            className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:bg-grey-50 dark:hover:bg-grey-800"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Verwerfen
          </button>
        ) : (
          !removed && (
            <button
              type="button"
              onClick={() => updateBox(box.id, { action: 'remove', change: '' })}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:bg-grey-50 dark:hover:bg-grey-800"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Entfernen
            </button>
          )
        )}
        {!added && isChanged(box) && (
          <button
            type="button"
            onClick={undo}
            className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold hover:bg-grey-50 dark:hover:bg-grey-800"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            Rückgängig
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Ziehen verschiebt, der Punkt unten rechts ändert die Größe.
      </p>
    </div>
  );
}

/** Boxes over the active image. Positions are BFL grid units (0–1000, y first) as percent. */
export function BevBoxOverlay({ bev }: { bev: BildEditorV2 }) {
  const { boxes, boxesLoading, selectedBoxId, setSelectedBoxId, updateBox, generating } = bev;
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // The stage dims the image while it detects; the bar below says what is going on.
  if (boxesLoading || generating || !boxes) return null;
  const selected = boxes.find((b) => b.id === selectedBoxId) ?? null;
  const names = boxNames(boxes);

  const startDrag = (e: PointerEvent<HTMLElement>, box: BevBox, kind: Drag['kind']) => {
    if (box.id !== selectedBoxId) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: box.id, kind, x: e.clientX, y: e.clientY, start: box.bbox };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    const rect = frame.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const dy = ((e.clientY - d.y) / rect.height) * 1000;
    const dx = ((e.clientX - d.x) / rect.width) * 1000;
    updateBox(d.id, {
      bbox: d.kind === 'move' ? moveBox(d.start, dy, dx) : resizeBox(d.start, dy, dx),
    });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, box: BevBox) => {
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-BOX_STEP, 0],
      ArrowDown: [BOX_STEP, 0],
      ArrowLeft: [0, -BOX_STEP],
      ArrowRight: [0, BOX_STEP],
    };
    const step = delta[e.key];
    if (!step) return;
    e.preventDefault();
    setSelectedBoxId(box.id);
    updateBox(box.id, {
      bbox: e.shiftKey ? resizeBox(box.bbox, ...step) : moveBox(box.bbox, ...step),
    });
  };

  return (
    <div ref={frame} className="absolute inset-0">
      {[...boxes].sort(byAreaDesc).map((box) => {
        const isSelected = box.id === selectedBoxId;
        const [top, left, bottom, right] = box.bbox;
        const removed = box.source !== null && box.action === 'remove';
        const changed = isChanged(box);
        const name = names.get(box.id) ?? '';
        return (
          <button
            key={box.id}
            type="button"
            aria-pressed={isSelected}
            aria-label={`${name} (${boxState(box)})`}
            onClick={() => setSelectedBoxId(isSelected ? null : box.id)}
            onKeyDown={(e) => onKeyDown(e, box)}
            onPointerDown={(e) => startDrag(e, box, 'move')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className={cn(
              'group absolute rounded-md outline-offset-2 transition-colors',
              isSelected ? 'z-[2] cursor-move border-2' : 'z-[1]',
              removed
                ? 'border-2 border-red-500 bg-red-500/25'
                : isSelected
                  ? 'border-primary-500 bg-primary-500/15'
                  : changed
                    ? 'border-2 border-primary-500'
                    : 'border border-white/35 hover:border-2 hover:border-white hover:bg-white/10'
            )}
            style={{
              top: `${top / 10}%`,
              left: `${left / 10}%`,
              height: `${(bottom - top) / 10}%`,
              width: `${(right - left) / 10}%`,
              touchAction: isSelected ? 'none' : 'auto',
            }}
          >
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute left-1 top-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white',
                removed ? 'bg-red-600' : changed || isSelected ? 'bg-primary-600' : 'bg-black/60',
                !isSelected && !changed && 'hidden group-hover:block group-focus-visible:block'
              )}
            >
              {removed ? `${name} – weg` : name}
            </span>
            {isSelected && (
              <span
                aria-hidden="true"
                onPointerDown={(e) => startDrag(e, box, 'resize')}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute -bottom-1.5 -right-1.5 size-3.5 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-primary-500"
              />
            )}
          </button>
        );
      })}
      {selected && (
        <BoxMenu key={selected.id} bev={bev} box={selected} name={names.get(selected.id) ?? ''} />
      )}
    </div>
  );
}

/** Under the image: what the expert mode is doing, and the button that applies the changes. */
export function BevBoxBar({ bev }: { bev: BildEditorV2 }) {
  const { boxes, boxesLoading, boxesError, addBox, resetBoxes, generating, submit } = bev;
  const changes = boxes?.filter(isChanged).length ?? 0;
  const status = boxesLoading
    ? 'Elemente werden erkannt …'
    : boxes
      ? changes > 0
        ? `${changes} Änderung${changes === 1 ? '' : 'en'}`
        : 'Tippe auf ein Element.'
      : (boxesError ?? 'Keine Elemente erkannt.');

  return (
    <div className="flex w-full max-w-[640px] shrink-0 flex-wrap items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-3 pr-1.5">
      <span className="rounded-full border border-grey-300 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground max-sm:hidden dark:border-grey-600">
        Experimentell
      </span>
      <span role="status" className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {status}
      </span>
      <button
        type="button"
        onClick={addBox}
        disabled={generating || boxesLoading || !boxes}
        title="Neues Element einfügen"
        aria-label="Neues Element"
        className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-grey-100 disabled:opacity-50 dark:hover:bg-grey-800"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={resetBoxes}
        disabled={generating || boxesLoading}
        title="Änderungen verwerfen und neu erkennen"
        aria-label="Neu erkennen"
        className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-grey-100 disabled:opacity-50 dark:hover:bg-grey-800"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => void submit('')}
        disabled={generating || boxesLoading || changes === 0}
        className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
      >
        Anwenden
      </button>
    </div>
  );
}
