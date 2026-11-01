// SPDX-License-Identifier: MPL-2.0
import React, { useId, useState } from 'react';
import {
  PiAlignBottom,
  PiAlignCenterHorizontal,
  PiAlignCenterVertical,
  PiAlignLeft,
  PiAlignRight,
  PiAlignTop,
  PiArrowsOutCardinal,
  PiColumns,
  PiRows,
} from 'react-icons/pi';

import { TILE, useBarTiles } from '@ggraphic/editor/components/TopBar/barTiles';
import { FloatingLayerControls } from '@ggraphic/editor/components/TopBar/modules/FloatingLayerControls';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { Popover, PopoverContent, PopoverTrigger } from '@ggraphic/editor/ui/popover';
import { CANVAS_COMMANDS } from '@ggraphic/editor/utils/canvasCommandRegistry';

import type { SelectionGeometry } from '@ggraphic/editor/utils/canvasCommands';
import type { IconType } from 'react-icons';

export type PositionCommandId =
  | 'alignLeft'
  | 'alignCenterH'
  | 'alignRight'
  | 'alignTop'
  | 'alignMiddle'
  | 'alignBottom'
  | 'distributeHorizontal'
  | 'distributeVertical';

const ALIGN: readonly { id: PositionCommandId; icon: IconType }[] = [
  { id: 'alignLeft', icon: PiAlignLeft },
  { id: 'alignCenterH', icon: PiAlignCenterHorizontal },
  { id: 'alignRight', icon: PiAlignRight },
  { id: 'alignTop', icon: PiAlignTop },
  { id: 'alignMiddle', icon: PiAlignCenterVertical },
  { id: 'alignBottom', icon: PiAlignBottom },
];

const DISTRIBUTE: readonly { id: PositionCommandId; icon: IconType }[] = [
  { id: 'distributeHorizontal', icon: PiColumns },
  { id: 'distributeVertical', icon: PiRows },
];

interface FloatingPositionControlProps {
  /**
   * Lässt sich die Auswahl verschieben (`selectionCapabilities`)? Ohne das
   * bleiben nur die Ebenen — ein gesperrtes Element wechselt sie weiter.
   */
  canAlign?: boolean;
  /** Mindestens drei bewegliche Elemente — nur in der Mehrfachauswahl gefragt. */
  canDistribute: boolean;
  onCommand: (id: PositionCommandId) => void;
  /**
   * Einzelauswahl: Lage und Größe, gelesen beim Öffnen und nach jeder
   * Änderung. Ohne sie (Mehrfachauswahl) gibt es Verteilen statt der Felder.
   */
  getGeometry?: () => SelectionGeometry | null;
  onPositionChange?: (patch: { x?: number; y?: number }) => void;
  onSizeChange?: (patch: { width?: number; height?: number }) => void;
  /** Einzelauswahl: Ebene nach oben/unten, wie bei Canva unter „Position“. */
  layer?: {
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMove: (direction: 'up' | 'down') => void;
  };
}

const TRIGGER_BTN =
  'inline-flex items-center h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none bg-transparent px-2 cursor-pointer whitespace-nowrap text-[13px] font-medium text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] data-[state=open]:bg-[var(--editor-active-bg)] data-[state=open]:text-[var(--editor-active-fg)]';

const GRID_BTN =
  'inline-flex items-center gap-1.5 h-8 max-canvas-mobile:h-11 rounded-md border-none bg-transparent px-2 cursor-pointer whitespace-nowrap text-[12px] text-[var(--editor-text)] transition-colors duration-150 hover:bg-[var(--editor-surface-hover)] hover:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

const show = (n: number) => String(Math.round(n));

/**
 * Ein Zahlenfeld, das erst beim Enter oder Verlassen schreibt: Tippen ändert
 * nur den Entwurf hier, nicht die Seite. Unverändertes und Unsinn verwirft es.
 */
function NumberField({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const n = Number(draft.trim().replace(',', '.'));
    if (draft.trim() !== '' && Number.isFinite(n) && draft.trim() !== show(value)) onCommit(n);
  };
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-[var(--editor-text-muted)]">
      <span className="w-3">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        value={draft ?? show(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="w-full min-w-0 h-7 max-canvas-mobile:h-11 rounded-md border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-2 text-[12px] tabular-nums text-[var(--editor-text)] disabled:opacity-40"
      />
    </label>
  );
}

/**
 * „Position“: Ausrichten, Verteilen und — einzeln — X, Y, B, H in logischen px
 * sowie die Ebene. Ein Text-Knopf wie bei Canva: ein Icon sagte hier zu wenig.
 */
export function FloatingPositionControl({
  canAlign = true,
  canDistribute,
  onCommand,
  getGeometry,
  onPositionChange,
  onSizeChange,
  layer,
}: FloatingPositionControlProps) {
  const t = useMessages();
  const tiles = useBarTiles();
  const [geometry, setGeometry] = useState<SelectionGeometry | null>(null);
  const read = () => setGeometry(getGeometry?.() ?? null);
  // Die Seite zeichnet die Änderung erst im nächsten Bild; danach neu lesen.
  const reread = () => requestAnimationFrame(read);
  const multi = !getGeometry;
  const titleId = useId();

  const button = (
    { id, icon: Icon }: { id: PositionCommandId; icon: IconType },
    disabled = false
  ) => (
    <button
      key={id}
      type="button"
      className={GRID_BTN}
      disabled={disabled}
      onClick={() => {
        onCommand(id);
        reread();
      }}
    >
      <Icon size={16} aria-hidden="true" />
      {CANVAS_COMMANDS[id].label}
    </button>
  );

  return (
    <Popover onOpenChange={(open) => open && read()}>
      <PopoverTrigger asChild>
        <button className={tiles ? TILE : TRIGGER_BTN} type="button">
          {tiles && <PiArrowsOutCardinal size={18} aria-hidden />}
          {t.topBar.position}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[10001] w-80 max-w-[calc(100vw-32px)] flex flex-col gap-2.5 p-3"
        align="center"
        aria-labelledby={titleId}
      >
        <span id={titleId} className="text-xs font-medium text-[var(--editor-text)]">
          {t.topBar.position}
        </span>
        {canAlign && <div className="grid grid-cols-3 gap-0.5">{ALIGN.map((a) => button(a))}</div>}
        {canAlign && multi && (
          <div className="grid grid-cols-2 gap-0.5">
            {DISTRIBUTE.map((d) => button(d, !canDistribute))}
          </div>
        )}
        {canAlign && geometry && (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="X"
              value={geometry.x}
              disabled={!onPositionChange}
              onCommit={(x) => {
                onPositionChange?.({ x });
                reread();
              }}
            />
            <NumberField
              label="Y"
              value={geometry.y}
              disabled={!onPositionChange}
              onCommit={(y) => {
                onPositionChange?.({ y });
                reread();
              }}
            />
            <NumberField
              label="B"
              value={geometry.width}
              disabled={!onSizeChange || geometry.resize === null}
              onCommit={(width) => {
                onSizeChange?.({ width });
                reread();
              }}
            />
            <NumberField
              label="H"
              value={geometry.height}
              disabled={!onSizeChange || geometry.resize === null || geometry.resize === 'width'}
              onCommit={(height) => {
                onSizeChange?.({ height });
                reread();
              }}
            />
          </div>
        )}
        {layer && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--editor-text-secondary)]">
              {t.sidebar.layers.title}
            </span>
            <FloatingLayerControls
              canMoveUp={layer.canMoveUp}
              canMoveDown={layer.canMoveDown}
              onMoveUp={() => layer.onMove('up')}
              onMoveDown={() => layer.onMove('down')}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
