import { Plus, RotateCcw } from 'lucide-react';
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';

import { BOX_STEP, isChanged, isMoved, moveBox, resizeBox } from './boxEdit';
import { type BevBox, type BevBoxAction } from './types';
import { type BildEditorV2 } from './useBildEditorV2';

export function ExperimentalBadge() {
  return (
    <span className="rounded-full border border-grey-300 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-muted-foreground dark:border-grey-600">
      Experimentell
    </span>
  );
}

const ACTION_LABEL: Record<BevBoxAction, string> = {
  keep: 'Behalten',
  change: 'Ändern',
  remove: 'Entfernen',
};

function boxState(box: BevBox): string {
  if (box.source === null) return 'Neu';
  if (box.action === 'keep') return isMoved(box) ? 'Verschoben' : 'Behalten';
  return ACTION_LABEL[box.action];
}

function boxName(box: BevBox): string {
  return box.desc || box.change || 'Neues Element';
}

/** Largest first, so small elements sit on top and stay clickable. */
function byAreaDesc(a: BevBox, b: BevBox): number {
  const area = (x: BevBox) => (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]);
  return area(b) - area(a);
}

interface Drag {
  id: string;
  kind: 'move' | 'resize';
  x: number;
  y: number;
  start: BevBox['bbox'];
}

/** Boxes over the active image. Positions are BFL grid units (0–1000, y first) as percent. */
export function BevBoxOverlay({ bev }: { bev: BildEditorV2 }) {
  const { boxes, boxesLoading, selectedBoxId, setSelectedBoxId, updateBox } = bev;
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  if (boxesLoading) {
    return (
      <div
        role="status"
        className="absolute inset-0 flex items-center justify-center rounded-[15px] bg-black/35 text-sm font-semibold text-white"
      >
        Elemente werden erkannt …
      </div>
    );
  }
  if (!boxes) return null;

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
        const selected = box.id === selectedBoxId;
        const [top, left, bottom, right] = box.bbox;
        const removed = box.source !== null && box.action === 'remove';
        return (
          <button
            key={box.id}
            type="button"
            aria-pressed={selected}
            aria-label={`${boxName(box)} (${boxState(box)})`}
            onClick={() => setSelectedBoxId(selected ? null : box.id)}
            onKeyDown={(e) => onKeyDown(e, box)}
            onPointerDown={(e) => startDrag(e, box, 'move')}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute rounded-[3px] outline-offset-2"
            style={{
              top: `${top / 10}%`,
              left: `${left / 10}%`,
              height: `${(bottom - top) / 10}%`,
              width: `${(right - left) / 10}%`,
              border: `2px ${removed || !isChanged(box) ? 'dashed' : 'solid'} ${
                removed
                  ? 'var(--bev-box-remove)'
                  : isChanged(box)
                    ? 'var(--bev-box-change)'
                    : 'var(--bev-box-keep)'
              }`,
              boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.45)',
              background: selected ? 'var(--bev-box-selected-bg)' : 'transparent',
              cursor: selected ? 'move' : 'pointer',
              touchAction: selected ? 'none' : 'auto',
              zIndex: selected ? 2 : 1,
            }}
          >
            {selected && (
              <span
                aria-hidden="true"
                onPointerDown={(e) => startDrag(e, box, 'resize')}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute -bottom-1.5 -right-1.5 size-3.5 rounded-full border-2 border-white"
                style={{
                  background: 'var(--bev-box-change)',
                  cursor: 'nwse-resize',
                  touchAction: 'none',
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Element list and the controls for the selected box — the non-pointer way to the same edit. */
export function BevBoxPanel({ bev, onSubmit }: { bev: BildEditorV2; onSubmit: () => void }) {
  const {
    boxes,
    boxesLoading,
    boxesError,
    selectedBoxId,
    setSelectedBoxId,
    updateBox,
    addBox,
    removeAddedBox,
    resetBoxes,
    generating,
  } = bev;
  const selected = boxes?.find((b) => b.id === selectedBoxId) ?? null;
  const changes = boxes?.filter(isChanged).length ?? 0;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ExperimentalBadge />
        <span className="text-xs text-muted-foreground">
          {boxesLoading
            ? 'Elemente werden erkannt …'
            : boxes
              ? `${boxes.length} Elemente · ${changes} geändert`
              : (boxesError ?? 'Keine Elemente erkannt')}
        </span>
        <span className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={addBox}
            disabled={generating || boxesLoading || !boxes}
            className="flex items-center gap-1 rounded-full border border-grey-200 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-grey-50 disabled:opacity-50 dark:border-grey-700 dark:hover:bg-grey-800"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Neues Element
          </button>
          <button
            type="button"
            onClick={resetBoxes}
            disabled={generating || boxesLoading}
            className="flex items-center gap-1 rounded-full border border-grey-200 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-grey-50 disabled:opacity-50 dark:border-grey-700 dark:hover:bg-grey-800"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Neu erkennen
          </button>
        </span>
      </div>

      {boxes && boxes.length > 0 && (
        <ul aria-label="Erkannte Elemente" className="flex flex-wrap gap-1.5">
          {boxes.map((box) => (
            <li key={box.id}>
              <button
                type="button"
                aria-pressed={box.id === selectedBoxId}
                onClick={() => setSelectedBoxId(box.id === selectedBoxId ? null : box.id)}
                className="max-w-56 truncate rounded-full border px-2.5 py-1 text-xs text-foreground"
                style={{
                  borderColor:
                    box.id === selectedBoxId ? 'var(--color-primary)' : 'var(--bev-hairline)',
                  fontWeight: isChanged(box) ? 700 : 400,
                }}
              >
                {boxName(box)} · {boxState(box)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="flex flex-col gap-2 rounded-lg border border-grey-200 p-2.5 dark:border-grey-700">
          {selected.source !== null && (
            <div role="group" aria-label="Was passiert mit dem Element?" className="flex gap-1.5">
              {(Object.keys(ACTION_LABEL) as BevBoxAction[]).map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-pressed={selected.action === action}
                  onClick={() => updateBox(selected.id, { action })}
                  className="rounded-full border px-2.5 py-1 text-xs font-semibold text-foreground"
                  style={{
                    borderColor:
                      selected.action === action ? 'var(--color-primary)' : 'var(--bev-hairline)',
                  }}
                >
                  {ACTION_LABEL[action]}
                </button>
              ))}
            </div>
          )}
          {(selected.source === null || selected.action === 'change') && (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {selected.source === null
                ? 'Was soll hier entstehen?'
                : 'Wie soll es danach aussehen?'}
              <textarea
                value={selected.change}
                onChange={(e) => updateBox(selected.id, { change: e.target.value })}
                rows={2}
                className="rounded-md border border-grey-200 bg-transparent p-2 text-sm text-foreground dark:border-grey-700"
              />
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            Box auf dem Bild ziehen oder mit den Pfeiltasten verschieben; Umschalt + Pfeiltaste
            ändert die Größe.
          </p>
          {selected.source === null && (
            <button
              type="button"
              onClick={() => removeAddedBox(selected.id)}
              className="self-start text-xs font-semibold text-foreground underline"
            >
              Neues Element verwerfen
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={generating || boxesLoading}
        className="self-start rounded-full px-4 py-1.5 text-xs font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
        style={{ background: 'var(--color-primary)' }}
      >
        {changes > 0
          ? `${changes} Änderung${changes === 1 ? '' : 'en'} anwenden`
          : 'Per Anweisung bearbeiten'}
      </button>
    </div>
  );
}
