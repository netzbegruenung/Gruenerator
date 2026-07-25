/**
 * Asks for the DIN-5008 fields a letter needs and the document does not carry.
 *
 * Everything recognised in the document text is prefilled (see
 * letterDetection.ts) — the dialog is where that proposal becomes visible and
 * editable. Removing the recognised lines from the body is opt-in via a
 * checkbox: doing it silently would delete content on a misdetection.
 */

import { useMemo, useState } from 'react';

import { detectLetterParts, hasDetectedParts } from './letterDetection';
import { isChoiceUsable, LetterheadChooser, type LetterheadChoice } from './LetterheadChooser';

import type { Letterhead } from '../settings/letterheadApi';
import type { pdfExportLetterSchema } from '@gruenerator/contracts';
import type { z } from 'zod';

export type LetterFields = z.infer<typeof pdfExportLetterSchema>;

export interface LetterExportSubmit {
  letter: LetterFields;
  /** Which Absender goes on the letterhead — saved, or typed here. */
  letterhead: LetterheadChoice;
  /** Drop the recognised lines from the body so they do not appear twice. */
  stripDetected: boolean;
}

const DEFAULT_SALUTATION = 'Sehr geehrte Damen und Herren,';
const DEFAULT_CLOSING = 'Mit freundlichen Grüßen';

const FIELD =
  'w-full rounded-lg border border-black/10 dark:border-white/15 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-grey-500 focus:outline-none focus:ring-2 focus:ring-primary/40';
const LABEL = 'block text-[0.8125rem] font-medium text-foreground mb-1';

export function LetterExportDialog({
  documentTitle,
  documentText,
  defaultSignature,
  letterheads,
  onCancel,
  onSubmit,
}: {
  documentTitle: string;
  letterheads: Letterhead[];
  /** Plain text of the document — the source for the prefill proposal. */
  documentText: string;
  /** Profile name, used when the document has no signature of its own. */
  defaultSignature: string;
  onCancel: () => void;
  onSubmit: (result: LetterExportSubmit) => void;
}) {
  const detected = useMemo(() => detectLetterParts(documentText), [documentText]);
  const foundSomething = hasDetectedParts(detected);

  const [recipient, setRecipient] = useState(detected.recipient ?? '');
  const [subject, setSubject] = useState(detected.subject ?? documentTitle);
  const [salutation, setSalutation] = useState(detected.salutation ?? DEFAULT_SALUTATION);
  const [closing, setClosing] = useState(detected.closing ?? DEFAULT_CLOSING);
  const [signature, setSignature] = useState(detected.signature ?? defaultSignature);
  const [place, setPlace] = useState('');
  const [stripDetected, setStripDetected] = useState(foundSomething);
  const [letterhead, setLetterhead] = useState<LetterheadChoice>(() => {
    const preselected = letterheads.find((l) => l.is_default) ?? letterheads[0];
    return preselected ? { letterheadId: preselected.id } : { inline: {} };
  });

  const canSubmit = recipient.trim().length > 0 && isChoiceUsable(letterhead);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="letter-export-title"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-grey-900 p-5 shadow-xl">
        <h2 id="letter-export-title" className="text-base font-semibold text-foreground mb-1">
          Als Brief exportieren
        </h2>
        <p className="text-[0.8125rem] text-grey-500 mb-4">
          Absender wählen oder neu eingeben; die übrigen Angaben ergänzen den Briefkopf nach DIN
          5008. Dein Name wird automatisch ergänzt.
        </p>

        {foundSomething && (
          <div className="mb-4 rounded-lg bg-primary/5 border border-primary/20 p-3">
            <p className="text-[0.8125rem] text-foreground">
              Aus dem Dokument übernommen — bitte prüfen.
            </p>
            <label className="mt-2 flex items-start gap-2 text-[0.8125rem] text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={stripDetected}
                onChange={(e) => setStripDetected(e.target.checked)}
              />
              <span>
                Erkannte Zeilen aus dem Dokumenttext entfernen, damit sie nicht doppelt erscheinen
              </span>
            </label>
          </div>
        )}

        <div className="mb-4 border-b border-black/10 pb-4 dark:border-white/10">
          <LetterheadChooser
            letterheads={letterheads}
            value={letterhead}
            onChange={setLetterhead}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className={LABEL} htmlFor="letter-recipient">
              Empfänger
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
              Eine Zeile je Adresszeile.
            </p>
          </div>

          <div>
            <label className={LABEL} htmlFor="letter-subject">
              Betreff
            </label>
            <input
              id="letter-subject"
              className={FIELD}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className={LABEL} htmlFor="letter-salutation">
              Anrede
            </label>
            <input
              id="letter-salutation"
              className={FIELD}
              value={salutation}
              onChange={(e) => setSalutation(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="letter-closing">
                Grußformel
              </label>
              <input
                id="letter-closing"
                className={FIELD}
                value={closing}
                onChange={(e) => setClosing(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="letter-place">
                Ort <span className="font-normal text-grey-500">(optional)</span>
              </label>
              <input
                id="letter-place"
                className={FIELD}
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="letter-signature">
              Unterschrift
            </label>
            <input
              id="letter-signature"
              className={FIELD}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
            />
          </div>
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
                stripDetected,
                letterhead,
                letter: {
                  recipient: recipient.trim(),
                  ...(subject.trim() && { subject: subject.trim() }),
                  ...(salutation.trim() && { salutation: salutation.trim() }),
                  ...(closing.trim() && { closing: closing.trim() }),
                  ...(signature.trim() && { signature: signature.trim() }),
                  ...(place.trim() && { place: place.trim() }),
                },
              })
            }
          >
            Brief erstellen
          </button>
        </div>
      </div>
    </div>
  );
}
