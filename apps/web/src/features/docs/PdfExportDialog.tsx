/**
 * One dialog for both PDF exports that carry an Absender.
 *
 * Two menu entries used to do this — "Als PDF mit Briefkopf" and "Als Brief" —
 * and the first exported immediately when only one letterhead was saved. So the
 * frictionless route produced a document with a sender band, while the DIN
 * letter sat one line below behind a form. Someone who wanted a letter got a
 * document and had no way to notice: both carry the same Absender block.
 *
 * There is deliberately NO layout switch here. What separates the two IS the
 * recipient, and the renderer already decides on exactly that rule
 * (PdfGenerationService: a spec counts as a letter once recipient or salutation
 * is filled). Asking it a second time as an abstract mode is how a UI and a
 * renderer drift apart — and it puts a vocabulary question ("Dokument oder
 * Brief?") in front of the one concrete thing the user actually knows.
 *
 * And there is deliberately nothing else to fill in. The dialog once asked for
 * Betreff, Anrede, Grußformel, Ort and Unterschrift; all five are ordinary
 * letter text and belong in the document, where the user is already writing.
 * The export has exactly one job the document cannot do itself: put Absender
 * and Anschrift on the millimetre positions DIN 5008 prescribes. The Betreff
 * comes from the document title, the date from the clock.
 */

import { useMemo, useState } from 'react';

import { detectRecipient } from './letterDetection';
import { isChoiceUsable, LetterheadChooser, type LetterheadChoice } from './LetterheadChooser';
import { useModalDialog } from './useModalDialog';

import type { Letterhead } from '../settings/letterheadApi';
import type { pdfExportLetterSchema } from '@gruenerator/contracts';
import type { z } from 'zod';

export type LetterFields = z.infer<typeof pdfExportLetterSchema>;

export interface PdfExportSubmit {
  /** Derived from the recipient, never asked separately. */
  layout: 'letterhead' | 'letter';
  /** Which Absender goes on the page — saved, or typed here. */
  letterhead: LetterheadChoice;
  /** Only set for a letter, and only ever the anschrift. */
  letter?: LetterFields;
  /** The address came from the body and moves into the Anschriftfeld — take it
   *  out of the text so it is not printed twice. */
  stripDetected: boolean;
}

const FIELD =
  'w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-grey-500 focus:outline-none focus:ring-2 focus:ring-primary/40';
const LABEL = 'block text-[0.8125rem] font-medium text-foreground mb-1';

/**
 * A4 at 1:1.414, drawn in millimetres so the boxes sit where the renderer puts
 * them: Absender at 25/18, Anschriftfeld at 20/50 (85 × 40), Betreff at 98,4,
 * fold marks at 105 and 148,5. Decoration only — `aria-hidden`, the banner text
 * next to it says the same thing.
 */
function PagePreview({ isLetter }: { isLetter: boolean }) {
  return (
    <svg
      viewBox="0 0 210 297"
      className="h-[74px] w-[52px] shrink-0 rounded-sm border border-black/15 bg-white dark:border-white/20 dark:bg-grey-800"
      aria-hidden="true"
    >
      <g className="fill-primary">
        <rect x="25" y="16" width="62" height="7" rx="2" />
        <rect x="25" y="26" width="44" height="4" rx="2" opacity="0.5" />
      </g>
      {isLetter ? (
        <g>
          <rect
            x="20"
            y="50"
            width="85"
            height="40"
            className="fill-none stroke-primary"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <g className="fill-current text-grey-400">
            <rect x="25" y="57" width="50" height="4" rx="2" />
            <rect x="25" y="66" width="62" height="4" rx="2" />
            <rect x="25" y="75" width="44" height="4" rx="2" />
            <rect x="125" y="50" width="60" height="4" rx="2" opacity="0.6" />
            <rect x="25" y="98" width="80" height="5" rx="2" />
          </g>
          <g className="fill-current text-grey-300">
            <rect x="25" y="115" width="160" height="3" rx="1.5" />
            <rect x="25" y="124" width="160" height="3" rx="1.5" />
            <rect x="25" y="133" width="120" height="3" rx="1.5" />
            <rect x="25" y="155" width="70" height="3" rx="1.5" />
          </g>
          <g className="fill-current text-grey-400">
            <rect x="0" y="104" width="7" height="1.5" />
            <rect x="0" y="148" width="7" height="1.5" />
          </g>
        </g>
      ) : (
        <g className="fill-current">
          <rect x="25" y="46" width="130" height="7" rx="2" className="text-grey-400" />
          <g className="text-grey-300">
            <rect x="25" y="64" width="160" height="3" rx="1.5" />
            <rect x="25" y="73" width="160" height="3" rx="1.5" />
            <rect x="25" y="82" width="140" height="3" rx="1.5" />
            <rect x="25" y="98" width="160" height="3" rx="1.5" />
            <rect x="25" y="107" width="160" height="3" rx="1.5" />
            <rect x="25" y="116" width="110" height="3" rx="1.5" />
          </g>
        </g>
      )}
    </svg>
  );
}

export function PdfExportDialog({
  documentTitle,
  documentText,
  letterheads,
  onCancel,
  onSubmit,
}: {
  documentTitle: string;
  letterheads: Letterhead[];
  /** Plain text of the document — searched for an address to prefill. */
  documentText: string;
  onCancel: () => void;
  onSubmit: (result: PdfExportSubmit) => void;
}) {
  const dialogRef = useModalDialog<HTMLDivElement>(onCancel);
  const detected = useMemo(() => detectRecipient(documentText), [documentText]);

  const [recipient, setRecipient] = useState(detected.recipient ?? '');
  const [letterhead, setLetterhead] = useState<LetterheadChoice>(() => {
    const preselected = letterheads.find((l) => l.is_default) ?? letterheads[0];
    return preselected ? { letterheadId: preselected.id } : { inline: {} };
  });

  // The same rule the renderer applies. A letter without an address is not
  // mailable, so there is nothing in between to represent.
  const isLetter = recipient.trim().length > 0;
  // Only ever removes what was recognised as an address block, and only when
  // that address is actually being reprinted in the Anschriftfeld.
  const stripDetected = isLetter && Boolean(detected.recipient);
  const canSubmit = isChoiceUsable(letterhead);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-export-title"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-grey-900 p-5 shadow-xl"
      >
        <h2 id="pdf-export-title" className="text-base font-semibold text-foreground mb-1">
          Als PDF mit Briefkopf
        </h2>
        <p className="text-[0.8125rem] text-grey-500 mb-4">
          Absender wählen. Sobald eine Empfängeranschrift dabeisteht, wird daraus ein versandfähiger
          Brief nach DIN 5008. Dein Name wird automatisch ergänzt.
        </p>

        <div
          className="mb-4 flex items-center gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]"
          aria-live="polite"
        >
          <PagePreview isLetter={isLetter} />
          <div>
            <p className="text-[0.8125rem] font-medium text-foreground">
              {isLetter ? 'Brief nach DIN 5008' : 'Dokument mit Briefkopf'}
            </p>
            <p className="mt-0.5 text-xs text-grey-500">
              {isLetter
                ? `Absender und Anschrift millimetergenau im Sichtfenster-Raster, dazu Datum und Falzmarken. Betreff: „${documentTitle}“.`
                : 'Dein Absender oben links — sonst bleibt es ein Dokument. Kein Anschriftfeld, keine Falzmarken.'}
            </p>
          </div>
        </div>

        <div className="mb-4 border-b border-black/10 pb-4 dark:border-white/10">
          <LetterheadChooser
            letterheads={letterheads}
            value={letterhead}
            onChange={setLetterhead}
          />
        </div>

        <div>
          <label className={LABEL} htmlFor="letter-recipient">
            Empfänger <span className="font-normal text-grey-500">(macht daraus einen Brief)</span>
          </label>
          <textarea
            id="letter-recipient"
            className={FIELD}
            rows={4}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder={'Name\nStraße und Hausnummer\nPLZ Ort'}
            aria-describedby="letter-recipient-hint"
          />
          <p id="letter-recipient-hint" className="mt-1 text-xs text-grey-500">
            Eine Zeile je Adresszeile. Leer lassen für ein Dokument ohne Anschrift.
            {stripDetected
              ? ' Sie stammt aus dem Dokument und wird dort entfernt — im Brief steht sie im Anschriftfeld.'
              : ' Anrede, Grußformel und Unterschrift schreibst du im Dokument.'}
          </p>
        </div>

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
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                layout: isLetter ? 'letter' : 'letterhead',
                letterhead,
                stripDetected,
                ...(isLetter && { letter: { recipient: recipient.trim() } }),
              })
            }
          >
            {isLetter ? 'Brief erstellen' : 'PDF erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
