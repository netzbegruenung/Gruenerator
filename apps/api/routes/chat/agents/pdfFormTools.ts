/**
 * PDF form tools for the agentic loop: inspect an attached form's fields, then
 * fill them and hand back a download.
 *
 * Deliberately two tools rather than one. German form fields carry opaque names
 * ("Kontrollkästchen3", "Textfeld_12"), so a single-shot fill would be guessing:
 * the model reads the field list first, maps the user's data onto real names,
 * then writes. Skipped fields come back with a reason so it can correct itself.
 *
 * The filled file is surfaced through the EXISTING compute card: the result is
 * written to `state.computedResult` (persisted as message metadata by
 * postResponseService) and streamed as a `compute` event, whose `fileAssets`
 * the card already renders as a download chip.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { readFormFields, fillFormFields } from '../../../services/pdfForm/pdfFormService.js';
import { createLogger } from '../../../utils/logger.js';
import { getThreadPdfFiles } from '../services/attachmentPersistenceService.js';
import { persistComputeAssets } from '../services/computeAssetStorage.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('PdfFormTool');

export interface PdfFormToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
  threadId: string | null;
}

const NO_PDF =
  'Es ist kein PDF-Formular angehängt. Bitte die*den Nutzer*in bitten, das Formular als PDF anzuhängen.';

type ResolvedPdf =
  | { ok: true; name: string; bytes: Buffer }
  | { ok: false; reason: 'none' }
  /** More than one candidate and no usable hint — the model must ask rather
   *  than silently pick one and fill the wrong form. */
  | { ok: false; reason: 'ambiguous'; names: string[] };

/**
 * Resolve the PDF to work on. A `fileName` hint is matched case-insensitively
 * on a substring, so the model can pass "Reisekosten" for
 * "Reisekosten_2026_final.pdf". With several candidates and no unique match the
 * answer is a QUESTION, not a guess — filling the wrong form is worse than
 * asking.
 */
async function resolvePdf(ctx: PdfFormToolCtx, fileName?: string): Promise<ResolvedPdf> {
  const current = ctx.state.pdfFormAttachments ?? [];
  const userId = ctx.state.agentConfig?.userId ?? null;
  const stored =
    ctx.threadId && userId ? await getThreadPdfFiles(ctx.threadId, userId).catch(() => []) : [];

  // De-duplicate by name: a form attached this turn AND persisted earlier would
  // otherwise look like two candidates and trigger a pointless question.
  const candidates = [...current, ...stored].filter(
    (c, i, all) => all.findIndex((o) => o.name === c.name) === i
  );
  if (candidates.length === 0) return { ok: false, reason: 'none' };

  const needle = fileName?.trim().toLowerCase();
  const matches = needle
    ? candidates.filter((c) => c.name.toLowerCase().includes(needle))
    : candidates;

  if (matches.length === 0) return { ok: false, reason: 'none' };
  if (matches.length > 1) {
    return { ok: false, reason: 'ambiguous', names: matches.map((m) => m.name) };
  }

  const match = matches[0];
  return { ok: true, name: match.name, bytes: Buffer.from(match.data, 'base64') };
}

/** Turns a failed resolve into the model-facing error, so both tools answer
 *  identically. */
function resolveError(resolved: Exclude<ResolvedPdf, { ok: true }>) {
  if (resolved.reason === 'none') return { error: NO_PDF };
  return {
    error: 'Es sind mehrere PDFs im Chat — bitte nachfragen, welches gemeint ist.',
    pdfs: resolved.names,
    hint: 'Rufe das Tool erneut mit fileName auf, sobald die*der Nutzer*in geantwortet hat.',
  };
}

/** Fields per read_pdf_form page. ~50 entries serialize to ~3 kB — comfortably
 *  under the loop's 6000-char result cap, whose array truncation would
 *  otherwise silently swallow everything past item 20. */
const FIELD_PAGE_SIZE = 50;

const FIELD_TYPE_LABEL: Record<string, string> = {
  text: 'Textfeld',
  checkbox: 'Ankreuzfeld',
  radio: 'Auswahl (eine Option)',
  dropdown: 'Dropdown',
  optionlist: 'Auswahlliste',
};

export function makeReadPdfFormTool(ctx: PdfFormToolCtx): Tool {
  return tool({
    description:
      'Listet die ausfüllbaren Felder eines angehängten PDF-Formulars auf (Feldname, Typ, erlaubte Werte, aktueller Inhalt). IMMER zuerst aufrufen, bevor du fill_pdf_form benutzt — nur so kennst du die echten Feldnamen.',
    inputSchema: z.object({
      fileName: z
        .string()
        .optional()
        .describe('Dateiname des Formulars, falls mehrere PDFs angehängt sind. Teilname genügt.'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          `Startindex für lange Formulare. Es werden je ${FIELD_PAGE_SIZE} Felder zurückgegeben; bei mehr Feldern erneut mit dem genannten offset aufrufen.`
        ),
    }),
    execute: async ({ fileName, offset }) => {
      const resolved = await resolvePdf(ctx, fileName);
      if (!resolved.ok) return resolveError(resolved);
      const pdf = resolved;

      let fields;
      try {
        fields = await readFormFields(pdf.bytes);
      } catch (err) {
        log.error(`[PdfFormTool] read failed: ${err instanceof Error ? err.message : err}`);
        return { error: `Das PDF "${pdf.name}" konnte nicht gelesen werden.` };
      }

      if (fields.length === 0) {
        // The single most common real-world case for German public forms.
        // Reported explicitly so the model says so instead of going quiet.
        return {
          fileName: pdf.name,
          fieldCount: 0,
          note: `Das PDF "${pdf.name}" enthält keine ausfüllbaren Formularfelder (es ist ein flaches bzw. gescanntes Dokument). Automatisches Ausfüllen ist hier nicht möglich. Sage das der*dem Nutzer*in und biete an, die Angaben stattdessen als Text zusammenzustellen.`,
        };
      }

      // Paginate explicitly. The loop's generic safety net (wrapTools →
      // truncateResultForModel) caps ANY array at 20 items once the serialized
      // result passes ~6000 chars, which a real form (Elster & co. run to
      // hundreds of fields) does — silently, so the model would fill 20 fields
      // and report success. A page the model is TOLD about is honest and
      // addressable; a silent cap is neither.
      const start = Math.min(offset ?? 0, fields.length);
      const page = fields.slice(start, start + FIELD_PAGE_SIZE);
      const nextOffset = start + page.length;
      const hasMore = nextOffset < fields.length;

      return {
        fileName: pdf.name,
        fieldCount: fields.length,
        shownFrom: start,
        shownTo: nextOffset - 1,
        fields: page.map((f) => ({
          name: f.name,
          type: FIELD_TYPE_LABEL[f.type] ?? f.type,
          ...(f.options.length > 0 && { erlaubteWerte: f.options }),
          ...(f.value != null && f.value !== '' && { aktuellerWert: f.value }),
          ...(f.readOnly && { schreibgeschuetzt: true }),
        })),
        ...(hasMore && {
          hasMore: true,
          nextOffset,
          note: `Das Formular hat ${fields.length} Felder; hier sind ${start}–${nextOffset - 1}. Rufe read_pdf_form erneut mit offset=${nextOffset} auf, BEVOR du ausfüllst — sonst kennst du nicht alle Feldnamen.`,
        }),
      };
    },
  });
}

export function makeFillPdfFormTool(ctx: PdfFormToolCtx): Tool {
  return tool({
    description:
      'Füllt die Felder eines angehängten PDF-Formulars aus und stellt die fertige Datei zum Download bereit. Verwende NUR Feldnamen, die read_pdf_form zurückgegeben hat. Trage nur Werte ein, die die*der Nutzer*in genannt hat — erfinde nichts.',
    inputSchema: z.object({
      fileName: z
        .string()
        .optional()
        .describe('Dateiname des Formulars, falls mehrere PDFs angehängt sind. Teilname genügt.'),
      values: z
        .record(z.string(), z.string())
        .describe(
          'Feldname → Wert. Ankreuzfelder: "true"/"false". Auswahlfelder: exakt einer der erlaubten Werte.'
        ),
      editable: z
        .boolean()
        .optional()
        .describe(
          'true = Formularfelder bleiben nachträglich änderbar. Standard false (fertiges Dokument).'
        ),
    }),
    execute: async ({ fileName, values, editable }) => {
      const userId = ctx.state.agentConfig?.userId ?? null;
      if (!userId) return { error: 'Keine Sitzung — das Formular kann nicht gespeichert werden.' };

      const resolved = await resolvePdf(ctx, fileName);
      if (!resolved.ok) return resolveError(resolved);
      const pdf = resolved;
      if (Object.keys(values).length === 0) {
        return { error: 'Keine Werte übergeben — es gibt nichts einzutragen.' };
      }

      let result;
      try {
        result = await fillFormFields(pdf.bytes, values, { flatten: editable !== true });
      } catch (err) {
        log.error(`[PdfFormTool] fill failed: ${err instanceof Error ? err.message : err}`);
        return { error: `Das Formular "${pdf.name}" konnte nicht ausgefüllt werden.` };
      }

      if (result.filled.length === 0) {
        // Nothing landed — almost always wrong field names. Hand the reasons
        // back so the next attempt can use read_pdf_form's exact names.
        return {
          error: 'Kein einziges Feld konnte ausgefüllt werden.',
          skipped: result.skipped,
          hint: 'Rufe read_pdf_form auf und verwende die Feldnamen exakt so, wie sie dort stehen.',
        };
      }

      const outName = pdf.name.replace(/\.pdf$/i, '') + '_ausgefuellt.pdf';
      // persistComputeAssets moves the base64 to uploads/compute-assets and
      // returns URL-only assets — the same path run_python exports take, so the
      // 90-day cleanup and the authenticated download route apply unchanged.
      const payload = await persistComputeAssets(userId, {
        operation: 'Formular ausgefüllt',
        entries: result.filled.map((name) => ({ label: name, value: values[name] ?? '' })),
        summary: `${result.filled.length} Feld(er) in "${pdf.name}" ausgefüllt.`,
        files: [{ name: outName, b64: result.bytes.toString('base64') }],
      });

      ctx.state.computedResult = payload;
      ctx.state.computedResultFresh = true;
      ctx.sse.send('compute', { compute: payload });

      log.info(`[PdfFormTool] Filled ${result.filled.length} field(s) in ${pdf.name}`);
      const skippedCount = Object.keys(result.skipped).length;
      return {
        ok: true,
        // Counts before the lists: the loop's safety net caps long arrays, and
        // a truncated `filledFields` must not make the model under-report.
        filledCount: result.filled.length,
        ...(skippedCount > 0 && { skippedCount }),
        fileName: outName,
        filledFields: result.filled,
        ...(Object.keys(result.skipped).length > 0 && { skipped: result.skipped }),
        note: `Die ausgefüllte Datei "${outName}" steht der*dem Nutzer*in bereits zum Download bereit — erwähne das kurz. Gib KEINEN Link aus.`,
      };
    },
  });
}
