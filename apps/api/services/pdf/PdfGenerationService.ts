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

import { pdfDocumentSchema, type PdfDocumentSpec } from './pdfDocument.js';
import { PDF_TYPE_AREA, renderPdf, type PdfLocale, type PdfSender } from './pdfRenderer.js';
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
- {"type":"divider"} · {"type":"pagebreak"}
- {"type":"signature","labels":["Ort, Datum","Unterschrift"]}
- {"type":"field", …}  ← NUR in Formularen, siehe unten

FORMULARE ("kind":"form"): Erzeuge echte, am Rechner ausfüllbare Felder.
- {"type":"field","kind":"text","label":"Vorname","width":"half","required":true}
- kind: "text" | "multiline" | "date" | "checkbox" | "radio" | "select"
- "options": Liste für "radio" und "select"
- "width":"half" → zwei Felder nebeneinander (wirkt nur bei zwei aufeinanderfolgenden halben Feldern)
- "rows": Zeilenhöhe bei "multiline"
- "help": kurzer Hinweis unter dem Feld
- Gliedere längere Formulare mit heading-Blöcken in Abschnitte und schließe mit einem signature-Block ab.

REGELN:
- Wähle den Aufbau passend zum Auftrag: ein Merkblatt braucht Überschriften und Listen, eine Übersicht eine Tabelle, ein Antrag Felder. Nutze NICHT immer dieselbe Struktur.
- "letter" nur bei Brief/Anschreiben ausfüllen ("kind":"letter"); dann enthalten die blocks NUR den Brieftext (Anrede, Gruß und Signatur stehen im letter-Objekt) und KEINE Überschriften.
- Bei "kind":"document" KEINE H1 mit dem Dokumenttitel — der Titel wird separat gesetzt.
- Barrierefreiheit: aussagekräftiger Titel, sprechende Überschriften in sinnvoller Reihenfolge (keine Ebene überspringen), Tabellen IMMER mit "columns" (Kopfzeile), jedes Feld mit klarem "label". Das System ergänzt daraus die technischen Tags.
- NIEMALS ein Datum erfinden; "place" nur bei bekanntem Ort.
- Deutsch, geschlechtergerecht (Genderstern *). Nutze die Fakten aus dem Auftrag vollständig, erfinde keine Zahlen oder Zitate.`;

export interface CreatePdfOptions {
  userId: string;
  locale: PdfLocale;
  sender?: PdfSender | null;
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

/** Parse the model's JSON (with fenced-block and brace fallbacks, like sheets/boards). */
export function parsePdfStructure(content: string): PdfDocumentSpec | null {
  const tryParse = (raw: string): PdfDocumentSpec | null => {
    try {
      const parsed = pdfDocumentSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        log.warn(`[PdfGeneration] structure rejected: ${parsed.error.issues[0]?.message ?? ''}`);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  };

  const direct = tryParse(content.trim());
  if (direct) return direct;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const fromFence = tryParse(fenced[1].trim());
    if (fromFence) return fromFence;
  }
  const match = content.match(/\{[\s\S]*\}/);
  return match ? tryParse(match[0]) : null;
}

/**
 * Render, verify and store. `documentId` is the stored file name (uuid.pdf) —
 * stable for the card's rehydration; `url` is the authenticated download route.
 */
export async function createPdfDocument(
  spec: PdfDocumentSpec,
  opts: CreatePdfOptions
): Promise<CreatePdfResult> {
  // The generation model recognises a letter from the wording more reliably
  // than the classifier does — trust its filled letter fields over the intent.
  const isLetter =
    spec.kind === 'letter' || Boolean(spec.letter?.recipient || spec.letter?.salutation);
  const effective: PdfDocumentSpec = isLetter ? { ...spec, kind: 'letter' } : spec;

  const rendered = await renderPdf(effective, { locale: opts.locale, sender: opts.sender ?? null });
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
