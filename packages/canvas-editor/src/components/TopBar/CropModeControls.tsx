import React from 'react';

const TEXT_BTN =
  'inline-flex items-center h-8 max-canvas-mobile:h-11 shrink-0 rounded-md border-none px-3 cursor-pointer text-[13px] font-medium transition-colors duration-150';

/**
 * CropModeControls — die Kontextleiste, solange ein Zuschneide-Modus läuft
 * (Hintergrundfoto oder eigenes Bild), auf dem Desktop wie in der mobilen
 * Auswahl-Leiste. Sie ersetzt die normalen Werkzeuge; was der Modus an
 * Werkzeugen braucht, gehört hierher.
 */
export function CropModeControls({
  onCancel,
  onDone,
}: {
  onCancel: () => void;
  onDone: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
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
