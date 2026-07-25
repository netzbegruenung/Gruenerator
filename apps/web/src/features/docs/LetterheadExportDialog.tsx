/**
 * Absender chooser for "Als PDF mit Briefkopf".
 *
 * Only shown when there is something to decide: with exactly one saved
 * letterhead the export uses it directly, because asking a question with one
 * possible answer is friction, not choice.
 */

import { useState } from 'react';

import { isChoiceUsable, LetterheadChooser, type LetterheadChoice } from './LetterheadChooser';

import type { Letterhead } from '../settings/letterheadApi';

export function LetterheadExportDialog({
  letterheads,
  onCancel,
  onSubmit,
}: {
  letterheads: Letterhead[];
  onCancel: () => void;
  onSubmit: (choice: LetterheadChoice) => void;
}) {
  const [choice, setChoice] = useState<LetterheadChoice>(() => {
    const preselected = letterheads.find((l) => l.is_default) ?? letterheads[0];
    return preselected ? { letterheadId: preselected.id } : { inline: {} };
  });

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="letterhead-export-title"
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-grey-900 p-5 shadow-xl">
        <h2 id="letterhead-export-title" className="text-base font-semibold text-foreground mb-1">
          Briefkopf wählen
        </h2>
        <p className="text-[0.8125rem] text-grey-500 mb-4">
          Erscheint oben links auf dem PDF. Das Dokument bleibt ein Dokument — kein Empfänger, kein
          Betreff, keine Anrede.
        </p>

        <LetterheadChooser letterheads={letterheads} value={choice} onChange={setChoice} />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm text-foreground hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onCancel}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="rounded-full bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
            disabled={!isChoiceUsable(choice)}
            onClick={() => onSubmit(choice)}
          >
            PDF erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
