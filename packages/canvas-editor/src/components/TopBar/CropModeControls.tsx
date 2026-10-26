import React from 'react';

import { CROP_ASPECT_PRESETS, isCropAspectId, type CropAspectId } from '../../utils/cropAspect';
import { clampStraighten, STRAIGHTEN_LIMIT } from '../../utils/straighten';

const TEXT_BTN =
  'inline-flex items-center h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none px-3 cursor-pointer text-[13px] font-medium transition-colors duration-150';

// 16 px auf Mobil: iOS zoomt sonst beim Antippen in die Seite.
const ASPECT_SELECT =
  'h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-2 cursor-pointer text-[13px] max-canvas-mobile:text-[16px] font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]';

const STRAIGHTEN_NUMBER =
  'h-8 max-canvas-mobile:h-11 w-14 shrink-0 rounded-md border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-1.5 text-right text-[13px] max-canvas-mobile:text-[16px] tabular-nums text-[var(--editor-text)]';

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
}: {
  onCancel: () => void;
  onDone: () => void;
  /** Seitenverhältnis-Auswahl; nur eigene Bilder haben sie. */
  aspect?: { value: CropAspectId; onChange: (id: CropAspectId) => void } | null;
  /** Begradigen (Grad, −45 … 45): Hintergrundfoto und eigene Bilder. */
  straighten?: { value: number; onChange: (deg: number) => void } | null;
  /** „Automatisch": Hintergrundfoto und eigene Bilder. */
  onAuto?: (() => void) | null;
}) {
  return (
    <div className="flex items-center gap-1">
      {onAuto && (
        <button
          type="button"
          className={`${TEXT_BTN} bg-transparent text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]`}
          onClick={() => onAuto()}
          aria-label="Ausschnitt automatisch wählen"
          title="Ausschnitt automatisch wählen"
        >
          Automatisch
        </button>
      )}
      {straighten && (
        <div className="flex items-center gap-1">
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
            className="w-28 max-canvas-mobile:w-24 h-8 max-canvas-mobile:h-11 shrink-0 accent-[var(--editor-accent)] cursor-pointer"
          />
          <input
            type="number"
            aria-label="Begradigen in Grad"
            min={-STRAIGHTEN_LIMIT}
            max={STRAIGHTEN_LIMIT}
            step={1}
            value={straighten.value}
            onChange={(e) => {
              // Ein halb getipptes „-" ist noch keine Zahl.
              if (e.currentTarget.value === '') return;
              straighten.onChange(clampStraighten(Number(e.currentTarget.value)));
            }}
            className={STRAIGHTEN_NUMBER}
          />
          <span aria-hidden="true" className="text-[13px] text-[var(--editor-text-secondary)]">
            °
          </span>
        </div>
      )}
      {aspect && (
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
      )}
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
    </div>
  );
}
