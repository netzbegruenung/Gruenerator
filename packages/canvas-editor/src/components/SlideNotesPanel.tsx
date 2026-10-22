import { useEffect, useId, useRef, useState } from 'react';
import { PiNote } from 'react-icons/pi';

interface SlideNotesPanelProps {
  value: string;
  onChange: (notes: string) => void;
}

const MAX_HEIGHT_PX = 160;

/**
 * Sprechernotizen einer Folie; Schlüssel `notes` im Seitenzustand.
 * Zu Beginn zu, leise unter der Folie — der Zustand gilt für die Editor-Sitzung
 * (die Komponente bleibt beim Seitenwechsel gemountet), nicht fürs Neuladen.
 */
export function SlideNotesPanel({ value, onChange }: SlideNotesPanelProps) {
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const hasNotes = value.trim().length > 0;

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [open, value]);

  return (
    <section aria-label="Sprechernotizen" className="w-full max-w-[56rem]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={fieldId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[32px] items-center gap-xs rounded-md px-xs text-xs text-[var(--editor-text-secondary)] hover:text-[var(--editor-text)]"
      >
        <PiNote aria-hidden="true" className="h-4 w-4" />
        <span>{hasNotes ? 'Notizen (1)' : 'Notizen'}</span>
      </button>
      {open && (
        <textarea
          ref={fieldRef}
          id={fieldId}
          aria-label="Sprechernotizen"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Notizen für den Vortrag …"
          className="mt-xs w-full resize-none rounded-md border border-[var(--editor-border)] bg-transparent p-xs text-xs text-[var(--editor-text-secondary)] placeholder:text-[var(--editor-placeholder)]"
        />
      )}
    </section>
  );
}
