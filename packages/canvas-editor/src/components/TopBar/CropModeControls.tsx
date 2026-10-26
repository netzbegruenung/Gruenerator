import React from 'react';

import { CROP_ASPECT_PRESETS, isCropAspectId, type CropAspectId } from '../../utils/cropAspect';

const TEXT_BTN =
  'inline-flex items-center h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none px-3 cursor-pointer text-[13px] font-medium transition-colors duration-150';

// 16 px auf Mobil: iOS zoomt sonst beim Antippen in die Seite.
const ASPECT_SELECT =
  'h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border border-[var(--editor-border-soft)] bg-[var(--editor-surface)] px-2 cursor-pointer text-[13px] max-canvas-mobile:text-[16px] font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-hover)]';

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
}: {
  onCancel: () => void;
  onDone: () => void;
  /** Seitenverhältnis-Auswahl; nur eigene Bilder haben sie. */
  aspect?: { value: CropAspectId; onChange: (id: CropAspectId) => void } | null;
}) {
  return (
    <div className="flex items-center gap-1">
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
