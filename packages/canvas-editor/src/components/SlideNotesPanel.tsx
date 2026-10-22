import { useId, useState } from 'react';

interface SlideNotesPanelProps {
  value: string;
  onChange: (notes: string) => void;
  /** Mobil (< 900 px): einklappbar, zu Beginn zu — die Fläche behält ihren Platz. */
  collapsible?: boolean;
}

/** Sprechernotizen einer Folie; Schlüssel `notes` im Seitenzustand. */
export function SlideNotesPanel({ value, onChange, collapsible = false }: SlideNotesPanelProps) {
  const [open, setOpen] = useState(!collapsible);
  const fieldId = useId();
  const expanded = !collapsible || open;

  return (
    <section
      aria-label="Sprechernotizen"
      className="w-full max-w-[56rem] rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] p-sm text-[var(--editor-text)]"
    >
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={fieldId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[44px] w-full items-center justify-between text-left text-sm font-medium text-[var(--editor-text-secondary)]"
        >
          Sprechernotizen
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
      ) : null}
      {expanded && (
        <textarea
          id={fieldId}
          aria-label="Sprechernotizen"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="Notizen für den Vortrag …"
          className="w-full resize-y rounded-md border border-[var(--editor-border)] bg-[var(--editor-bg)] p-xs text-sm text-[var(--editor-text)] placeholder:text-[var(--editor-placeholder)]"
        />
      )}
    </section>
  );
}
