// SPDX-License-Identifier: MPL-2.0
import { cn } from '@ggraphic/editor/utils/cn';
import {
  CROP_ASPECT_PRESETS,
  isCropAspectId,
  type CropAspectId,
} from '@ggraphic/editor/utils/cropAspect';
import { clampStraighten, STRAIGHTEN_LIMIT } from '@ggraphic/editor/utils/straighten';
import React, { useState } from 'react';

import { HIDDEN_SCROLLBAR } from '../../sidebar/sidebarStyles';

const TEXT_BTN =
  'inline-flex items-center h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none px-3 cursor-pointer text-[13px] font-medium transition-colors duration-150';

// 16 px auf Mobil: iOS zoomt sonst beim Antippen in die Seite.
const ASPECT_SELECT =
  'h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-2 cursor-pointer text-[13px] max-canvas-mobile:text-[16px] font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]';

const STRAIGHTEN_NUMBER =
  'h-8 max-canvas-mobile:h-11 w-14 shrink-0 rounded-md border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-1.5 text-right text-[13px] max-canvas-mobile:text-[16px] tabular-nums text-[var(--editor-text)]';

const STRAIGHTEN_MIN = -STRAIGHTEN_LIMIT;

/**
 * Zahlenfeld zum Regler: getippt wird in einen Entwurf, übernommen erst mit
 * Enter oder beim Verlassen — sonst ersetzte jeder Tastendruck die Eingabe
 * („12" würde 2, „-" ginge gar nicht). Escape verwirft den Entwurf.
 */
function StraightenField({ value, onCommit }: { value: number; onCommit: (deg: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string): number | null => {
    const parsed = Number(text.replace(',', '.'));
    if (text.trim() === '' || !Number.isFinite(parsed)) return null;
    const deg = clampStraighten(parsed);
    if (deg !== value) onCommit(deg);
    return deg;
  };
  const step = (by: number) => {
    const base = draft !== null ? Number(draft.replace(',', '.')) : value;
    const deg = clampStraighten((Number.isFinite(base) ? base : value) + by);
    if (deg !== value) onCommit(deg);
    setDraft(String(deg));
  };
  return (
    <input
      type="text"
      // Nicht `numeric`: die iOS-Zifferntastatur hat kein Minus.
      inputMode="text"
      role="spinbutton"
      aria-label="Begradigen in Grad"
      aria-valuemin={STRAIGHTEN_MIN}
      aria-valuemax={STRAIGHTEN_LIMIT}
      aria-valuenow={value}
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => {
        if (draft !== null) commit(draft);
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const deg = draft !== null ? commit(draft) : null;
          setDraft(String(deg ?? value));
        } else if (e.key === 'Escape') {
          // preventDefault: die Editor-Tastatur beendet sonst den Zuschneide-Modus.
          e.preventDefault();
          setDraft(String(value));
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          step(e.key === 'ArrowUp' ? 1 : -1);
        }
      }}
      className={STRAIGHTEN_NUMBER}
    />
  );
}

/**
 * CropModeControls — die Kontextleiste, solange ein Zuschneide-Modus läuft
 * (Hintergrundfoto oder eigenes Bild), auf dem Desktop wie in der mobilen
 * Auswahl-Leiste. Sie ersetzt die normalen Werkzeuge; was der Modus an
 * Werkzeugen braucht, gehört hierher.
 */
export function CropModeControls({
  onCancel,
  onDone,
  aspect = null,
  straighten = null,
  onAuto = null,
  expand = null,
  layout = 'inline',
}: {
  onCancel: () => void;
  onDone: () => void;
  /** Seitenverhältnis-Auswahl; nur eigene Bilder haben sie. */
  aspect?: { value: CropAspectId; onChange: (id: CropAspectId) => void } | null;
  /** Begradigen (Grad, −45 … 45): Hintergrundfoto und eigene Bilder. */
  straighten?: { value: number; onChange: (deg: number) => void } | null;
  /** „Automatisch": Hintergrundfoto und eigene Bilder. */
  onAuto?: (() => void) | null;
  /** „Erweitern" (KI): Hintergrundfoto und eigene Bilder, nur mit Dienst des Hosts. */
  expand?: { onExpand: () => void; busy: boolean } | null;
  /**
   * `mobile`: Begradigen in eigener Zeile, Abbrechen/Fertig außerhalb des
   * Scrollbereichs — sonst schöbe man sie aus dem Bild und wischte auf dem Weg
   * dorthin über den Regler (auf Android begradigt das).
   */
  layout?: 'inline' | 'mobile';
}) {
  const expandButton = expand && (
    <button
      type="button"
      className={`${TEXT_BTN} bg-transparent text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)] disabled:opacity-60 disabled:cursor-wait`}
      onClick={() => expand.onExpand()}
      disabled={expand.busy}
      aria-busy={expand.busy}
      title="Foto per KI auf das Format des Rahmens erweitern"
    >
      {expand.busy && (
        <span
          aria-hidden="true"
          className="mr-1.5 size-3.5 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
        />
      )}
      Erweitern
    </button>
  );
  const autoButton = onAuto && (
    <button
      type="button"
      className={`${TEXT_BTN} bg-transparent text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]`}
      onClick={() => onAuto()}
      aria-label="Ausschnitt automatisch wählen"
      title="Ausschnitt automatisch wählen"
    >
      Automatisch
    </button>
  );
  const straightenControls = straighten && (
    <div
      data-crop-straighten=""
      className={cn('flex items-center gap-1', layout === 'mobile' && 'w-full gap-2')}
    >
      <input
        type="range"
        aria-label="Begradigen"
        title="Begradigen"
        min={-STRAIGHTEN_LIMIT}
        max={STRAIGHTEN_LIMIT}
        step={1}
        value={straighten.value}
        onChange={(e) => straighten.onChange(clampStraighten(Number(e.currentTarget.value)))}
        onDoubleClick={() => straighten.onChange(0)}
        className="w-28 max-canvas-mobile:w-auto max-canvas-mobile:flex-1 min-w-0 h-8 max-canvas-mobile:h-11 shrink-0 accent-[var(--editor-accent)] cursor-pointer"
      />
      <StraightenField value={straighten.value} onCommit={straighten.onChange} />
      <span aria-hidden="true" className="text-[13px] text-[var(--editor-text-secondary)]">
        °
      </span>
    </div>
  );
  const aspectSelect = aspect && (
    <select
      aria-label="Seitenverhältnis"
      title="Seitenverhältnis"
      className={ASPECT_SELECT}
      value={aspect.value}
      onChange={(e) => {
        if (isCropAspectId(e.target.value)) aspect.onChange(e.target.value);
      }}
    >
      {CROP_ASPECT_PRESETS.map((preset) => (
        <option key={preset.id} value={preset.id}>
          {preset.label}
        </option>
      ))}
    </select>
  );
  const exits = (
    <>
      <button
        type="button"
        className={`${TEXT_BTN} bg-transparent text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]`}
        onClick={onCancel}
        title="Abbrechen (Zuschnitt verwerfen)"
      >
        Abbrechen
      </button>
      <button
        type="button"
        className={`${TEXT_BTN} bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)]`}
        onClick={onDone}
        title="Fertig (Esc)"
      >
        Fertig
      </button>
    </>
  );

  if (layout === 'mobile') {
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
        {straightenControls}
        <div className="flex min-w-0 items-center gap-1">
          <div
            data-crop-tools=""
            className={cn(
              'canvas-scroll-fade-x flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto',
              HIDDEN_SCROLLBAR
            )}
          >
            {expandButton}
            {autoButton}
            {aspectSelect}
          </div>
          <div data-crop-exits="" className="flex flex-none items-center gap-1">
            {exits}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {expandButton}
      {autoButton}
      {straightenControls}
      {aspectSelect}
      {exits}
    </div>
  );
}
