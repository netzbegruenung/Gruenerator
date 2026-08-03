/**
 * PDF generation service for the create_pdf chat intent / fat tool.
 *
 * Chat-side lifecycle: turn a free-text brief into a block document, render it
 * tagged + CI-styled via pdfRenderer, verify the finished bytes, then store the
 * binary under the user's compute-assets directory. Unlike the other create_*
 * kinds there is no collaborative document — the result is a finished,
 * downloadable file served session-authenticated via
 * /api/chat-service/compute-assets/:fileName (90-day retention).
 */

import { storeBinaryAsset } from '../../routes/chat/services/computeAssetStorage.js';
import { createLogger } from '../../utils/logger.js';

import { pdfDocumentFromModelSchema, type PdfDocumentSpec } from './pdfDocument.js';
import {
  PDF_TYPE_AREA,
  renderPdf,
  type PdfLocale,
  type PdfSender,
  type RenderPdfOptions,
} from './pdfRenderer.js';
import { summarizeVerification, verifyPdf, type PdfVerification } from './pdfVerification.js';

const log = createLogger('PdfGeneration');

export const PDF_GENERATION_PROMPT = `Du bist ein Dokumenten-Assistent für die Grünen. Du entwirfst den Inhalt UND den Aufbau eines fertigen PDF-Dokuments.

Antworte NUR mit einem JSON-Objekt:
{
  "title": "Dokumenttitel",
  "subtitle": "optionaler Untertitel",
  "kind": "document" | "letter" | "form",
  "language": "de-DE",
  "letter": { "recipient": "Name\\nStraße\\nPLZ Ort", "place": "Musterstadt", "subject": "Betreff", "salutation": "Sehr geehrte Frau …,", "closing": "Mit freundlichen Grüßen", "signature": "Name\\nFunktion" },
  "blocks": [ … ]
}

VERFÜGBARE BLÖCKE — kombiniere sie frei, so wie es der Auftrag verlangt:
- {"type":"heading","level":1|2|3,"text":"…"}
- {"type":"paragraph","text":"Fließtext, **fett** und *kursiv* erlaubt"}
- {"type":"list","ordered":true|false,"items":["…","…"]}
- {"type":"table","columns":["Spalte A","Spalte B"],"rows":[["…","…"]],"caption":"optional"}
- {"type":"keyvalue","entries":[{"label":"Datum","value":"01.03.2026"}]}  ← Datenblatt/Eckdaten
- {"type":"quote","text":"Zitat","source":"Quelle"}
- {"type":"note","title":"Hinweis","text":"hervorgehobener Kasten"}
- {"type":"sources","entries":[{"label":"Rat der EU: Klimaziel 2040","value":"https://…"}]}  ← Quellenverzeichnis
- {"type":"divider"} · {"type":"pagebreak"}
- {"type":"signature","labels":["Ort, Datum","Unterschrift"]}
- {"type":"field", …}  ← NUR in Formularen, siehe unten

FORMULARE ("kind":"form"): Erzeuge echte, am Rechner ausfüllbare Felder.
- {"type":"field","kind":"text","label":"Vorname","width":"half","required":true}
- kind: "text" | "multiline" | "date" | "checkbox" | "radio" | "select"
- "options": Liste für "radio" und "select"
- "width":"half" → zwei Felder nebeneinander (wirkt nur bei zwei aufeinanderfolgenden halben Feldern)
- "lines": Zeilenhöhe bei "multiline"
- "help": kurzer Hinweis unter dem Feld
- Gliedere längere Formulare mit heading-Blöcken in Abschnitte und schließe mit einem signature-Block ab.

REGELN:
- Wähle den Aufbau passend zum Auftrag: ein Merkblatt braucht Überschriften und Listen, eine Übersicht eine Tabelle, ein Antrag Felder. Nutze NICHT immer dieselbe Struktur.
- "letter" nur bei Brief/Anschreiben ausfüllen ("kind":"letter"); dann enthalten die blocks NUR den Brieftext (Anrede, Gruß und Signatur stehen im letter-Objekt) und KEINE Überschriften.
- BRIEFE werden im Fensterkuvert versendet. "recipient" ist deshalb Pflicht und muss maschinenlesbar sein (DIN 5008 / Deutsche Post): höchstens 6 Zeilen, KEINE Leerzeile dazwischen, Reihenfolge Firma/Organisation → Person → Zusatz (z. B. Abteilung) → Straße und Hausnummer bzw. Postfach → PLZ und Ort in EINER Zeile. Kein Land bei Inlandspost, keine Sonderzeichen außer Umlauten, PLZ nie unterstreichen. Ist keine Anschrift bekannt, erzeuge KEINEN Brief, sondern "kind":"document".
- Bei "kind":"document" KEINE H1 mit dem Dokumenttitel — der Titel wird separat gesetzt.
- Optionale Felder, die nicht zutreffen, LÄSST DU WEG. Schreibe nie "caption": null oder "subtitle": null.
- Barrierefreiheit: aussagekräftiger Titel, sprechende Überschriften in sinnvoller Reihenfolge (keine Ebene überspringen), Tabellen IMMER mit "columns" (Kopfzeile), jedes Feld mit klarem "label". Das System ergänzt daraus die technischen Tags.
- NIEMALS ein Datum erfinden; "place" nur bei bekanntem Ort.
- NIEMALS Platzhalter ausgeben ("Beispielautor*in", "Kernpunkt 1", "hier eintragen", example.com). Gibt der Auftrag zu einem Abschnitt nichts her, lass ihn weg. Ein kurzes, vollständig ausgefülltes Dokument ist richtig — ein langes Formular zum Selbstausfüllen ist falsch.
- Enthält der Auftrag recherchierte Quellen (Zeilen der Form "[1] Titel <URL> — Auszug"), nutze deren Fakten und hänge EINEN sources-Block an — keine Tabelle: "label" ist der Quellentitel, "value" die VOLLSTÄNDIGE URL. Reihenfolge wie im Auftrag, damit "[1]" im Text und "[1]" im Verzeichnis dieselbe Quelle meinen. Übernimm nur Quellen aus dem Auftrag, erfinde keine. Der Block bringt die Überschrift "Quellen" selbst mit — setze KEINEN heading-Block davor.
- Verweise im Text mit "[1]", "[2]". NIEMALS "[^1]": das ist Markdown-Fußnotensyntax, die ein PDF nicht kennt — sie stünde wörtlich im fertigen Dokument.
- Deutsch, geschlechtergerecht (Genderstern *). Nutze die Fakten aus dem Auftrag vollständig, erfinde keine Zahlen oder Zitate.`;

export interface CreatePdfOptions extends Pick<
  RenderPdfOptions,
  'dispatchMode' | 'returnLine' | 'foldMarks' | 'stationery'
> {
  userId: string;
  locale: PdfLocale;
  sender?: PdfSender | null;
  /**
   * Optional one-shot repair. Called ONLY when the self-check found problems
   * the model can actually act on (see `repairableProblems`), with those
   * problems as German instructions. Returns a corrected spec, or null to keep
   * the first attempt.
   *
   * The caller owns this callback because it owns the model handle; the
   * render/verify loop lives here so that only the ACCEPTED bytes are ever
   * stored — repairing after `storeBinaryAsset` would leave an orphan file.
   */
  regenerate?: (problems: string[]) => Promise<PdfDocumentSpec | null>;
}

export interface CreatedPdfDocument {
  documentId: string;
  title: string;
  subtype: 'pdf';
  url: string;
}

export interface CreatePdfResult {
  document: CreatedPdfDocument;
  /** Kept out of `document` so the SSE card payload stays lean. */
  verification: PdfVerification;
  /** One-line result of the self-check, ready to show or hand to the model. */
  summary: string;
}

/**
 * Validate an already-parsed object from the MODEL.
 *
 * Goes through `pdfDocumentFromModelSchema`, which normalizes the model's
 * dialect (`"caption": null` for "not applicable") before the strict gate —
 * see the comment there for why the leniency lives at this edge and not in the
 * schema itself.
 *
 * The error carries the issue PATHS, not just the message: the old log read
 * "structure rejected: Required", which named no field and left a production
 * failure undiagnosable. The paths also drive the repair turn in
 * generateStructured.
 */
export function validatePdfStructure(
  input: unknown
): { ok: true; value: PdfDocumentSpec } | { ok: false; error: string } {
  const parsed = pdfDocumentFromModelSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const error = parsed.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
  return { ok: false, error };
}

// `parsePdfStructure` lived here: it pulled JSON out of a text answer (direct /
// fenced / braced) and then validated it, returning a bare `null` on failure.
// That null is why a rejection on the text transport reached the repair turn as
// "Kein Tool-Aufruf in der Antwort" instead of the offending field. The
// extraction now lives in generateStructured (jsonCandidatesFromText), which
// feeds `validatePdfStructure` above — one gate for both transports.

/**
 * Render, verify and store. `documentId` is the stored file name (uuid.pdf) —
 * stable for the card's rehydration; `url` is the authenticated download route.
 */
/**
 * The subset of self-check findings a REGENERATION could plausibly fix.
 *
 * Derived from structured fields, never by matching the German problem
 * strings — those are user-facing prose and would silently stop matching the
 * first time someone rewords one.
 *
 * Deliberately excluded, because handing them to the model burns a generation
 * and risks a worse document for nothing:
 *  - missing tags / `/Lang` / the PDF/UA identifier — these are properties of
 *    the RENDERER, not of the content. If they are absent, `pdfRenderer` has a
 *    bug and no rewrite of the text will change it.
 *  - a letter's missing recipient address — the model cannot invent someone's
 *    address. Asking the USER is the correct behaviour and already happens.
 *  - the form-appearance note — informational, about the reader, not the file.
 */
function repairableProblems(
  verification: PdfVerification,
  rendered: { missingGlyphs: string[] }
): string[] {
  const problems: string[] = [];
  if (verification.overflowingText.length > 0) {
    problems.push(
      `Dieser Text läuft aus dem Satzspiegel heraus und wird abgeschnitten: ` +
        `${verification.overflowingText.slice(0, 5).join(' | ')}. ` +
        `Kürze die betroffenen Stellen deutlich oder teile sie auf mehrere Blöcke auf.`
    );
  }
  if (rendered.missingGlyphs.length > 0) {
    problems.push(
      `Diese Zeichen können die Schriften nicht darstellen und wurden entfernt: ` +
        `${rendered.missingGlyphs.join(' ')}. Formuliere die Stellen ohne diese Zeichen.`
    );
  }
  if (verification.fieldsWithoutLabel.length > 0) {
    problems.push(
      `Diese Formularfelder haben kein "label" — ein Screenreader liest dann den ` +
        `technischen Feldnamen vor: ${verification.fieldsWithoutLabel.join(', ')}. ` +
        `Gib jedem Feld ein sprechendes "label".`
    );
  }
  return problems;
}

/** Render + self-check, without storing. Runs once per repair attempt. */
async function renderAndVerify(
  effective: PdfDocumentSpec,
  opts: CreatePdfOptions
): Promise<{ rendered: Awaited<ReturnType<typeof renderPdf>>; verification: PdfVerification }> {
  const rendered = await renderPdf(effective, {
    locale: opts.locale,
    sender: opts.sender ?? null,
    ...(opts.dispatchMode !== undefined && { dispatchMode: opts.dispatchMode }),
    ...(opts.returnLine !== undefined && { returnLine: opts.returnLine }),
    ...(opts.foldMarks !== undefined && { foldMarks: opts.foldMarks }),
    ...(opts.stationery !== undefined && { stationery: opts.stationery }),
  });
  const verification = await verifyPdf(rendered.bytes, PDF_TYPE_AREA);
  if (rendered.missingGlyphs.length) {
    verification.problems.push(
      `${rendered.missingGlyphs.length} Zeichen konnten mit den Schriften nicht dargestellt werden und wurden entfernt: ${rendered.missingGlyphs.join(' ')}`
    );
  }
  if (rendered.appearanceFallback) {
    verification.problems.push(
      'Die Formularfelder werden erst vom PDF-Reader gezeichnet — in manchen Vorschauen wirken sie leer.'
    );
  }
  // Ohne Anschrift bleibt das Anschriftfeld leer: im Fensterkuvert und für jeden
  // digitalen Versanddienst ist der Brief damit nicht zustellbar. Das gehört zum
  // Nutzer, nicht still ins Log.
  if (effective.kind === 'letter' && !effective.letter?.recipient?.trim()) {
    verification.problems.push(
      'Dem Brief fehlt die Empfängeranschrift — ohne sie ist er nicht versandfähig. Frage nach Name, Straße und PLZ/Ort.'
    );
  }
  return { rendered, verification };
}

/** A letter is recognised from filled letter fields, not only the declared kind
 *  — the generation model reads the wording more reliably than the classifier. */
function asEffectiveSpec(spec: PdfDocumentSpec): PdfDocumentSpec {
  const isLetter =
    spec.kind === 'letter' || Boolean(spec.letter?.recipient || spec.letter?.salutation);
  return isLetter ? { ...spec, kind: 'letter' } : spec;
}

export async function createPdfDocument(
  spec: PdfDocumentSpec,
  opts: CreatePdfOptions
): Promise<CreatePdfResult> {
  const effective = asEffectiveSpec(spec);
  let attempt = await renderAndVerify(effective, opts);

  // Bounded repair: at most ONE extra round, and only for findings a rewrite
  // can address. Everything else keeps the old behaviour — deliver the file and
  // disclose the problem — because a document the user can still fix by hand
  // beats no document at all.
  const repairable = repairableProblems(attempt.verification, attempt.rendered);
  if (repairable.length > 0 && opts.regenerate) {
    try {
      const repairedSpec = await opts.regenerate(repairable);
      if (repairedSpec) {
        const second = await renderAndVerify(asEffectiveSpec(repairedSpec), opts);
        const before = repairable.length;
        const after = repairableProblems(second.verification, second.rendered).length;
        // Keep the repair only if it actually helped. A regeneration that trades
        // one overflow for two is a worse document, and the model cannot tell.
        if (after < before) {
          log.info(`PDF repair improved the document: ${before} → ${after} fixable problem(s)`);
          attempt = second;
        } else {
          log.info(`PDF repair did not improve the document (${before} → ${after}); keeping first`);
        }
      }
    } catch (err) {
      // A failed repair must never cost the user their document.
      log.warn(`PDF repair failed, keeping the first attempt: ${String(err)}`);
    }
  }

  const { rendered, verification } = attempt;
  const { fileName, url } = await storeBinaryAsset(opts.userId, rendered.bytes, 'pdf');
  log.info(
    `PDF created for user ${opts.userId}: "${effective.title}" (${fileName}, ${rendered.bytes.length} bytes) — ${summarizeVerification(verification)}${
      verification.problems.length ? ` | Probleme: ${verification.problems.join(' ')}` : ''
    }`
  );

  return {
    document: { documentId: fileName, title: effective.title, subtype: 'pdf', url },
    verification,
    summary: summarizeVerification(verification),
  };
}
