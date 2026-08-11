/**
 * Editing a PDF means re-rendering it, so the previous spec has to be found.
 *
 * A PDF leaves no editable artefact behind: `createPdfDocument` stores bytes
 * under an asset file name, and the ref that reaches `lastToolContext` is that
 * file name — deliberately not a collaborative-document UUID, which is why no
 * doc-edit gate may dereference it (see artifactKinds.ts). Until this module
 * existed there was consequently nothing to edit, and an edit request landed in
 * the prose lane where the model confirmed a change that never happened.
 *
 * Both creation doors persist `pdfSpec` into the assistant message's
 * `tool_results`: PDF_SPEC.persistMetadata on the single-pass path,
 * postResponseService on the agentic tool path. This reads the newest one back.
 */

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { validatePdfStructure } from '../../../services/pdf/PdfGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

import type { PdfDocumentSpec } from '../../../services/pdf/pdfDocument.js';

const log = createLogger('PdfEditContext');

/**
 * How far back to look for the thread's last PDF.
 *
 * Bounded on purpose: a thread that produced a PDF fifty turns ago and has been
 * about something else since should NOT have "mach das kürzer" silently re-open
 * it. Ten assistant turns is roughly the window in which a follow-up still
 * refers to the same artefact.
 */
const LOOKBACK_MESSAGES = 10;

export async function loadLastPdfSpec(threadId: string): Promise<PdfDocumentSpec | null> {
  const rows = (await getPostgresInstance().query(
    `SELECT tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT $2`,
    [threadId, LOOKBACK_MESSAGES]
  )) as Array<{ tool_results?: unknown }>;

  for (const row of rows) {
    const meta = row.tool_results;
    if (!meta || typeof meta !== 'object') continue;
    const spec = (meta as { pdfSpec?: unknown }).pdfSpec;
    if (spec == null) continue;
    // Re-validated rather than trusted: the row may have been written by an
    // older shape of the spec, and a malformed base would poison the rewrite
    // prompt instead of failing loudly.
    const parsed = validatePdfStructure(spec);
    if (parsed.ok) return parsed.value;
    log.warn(`[PdfEdit] Stored pdfSpec no longer validates, ignoring it: ${parsed.error}`);
  }
  return null;
}

/**
 * Turn the previous document plus the user's instruction into one brief.
 *
 * The full spec goes in as JSON rather than as rendered prose: it is what the
 * generator emits anyway, so round-tripping it keeps block kinds, table shapes
 * and letter fields that a prose summary would quietly drop.
 */
export function buildPdfEditBrief(base: PdfDocumentSpec, instruction: string): string {
  return (
    `Du überarbeitest ein BESTEHENDES PDF-Dokument. Hier ist es vollständig als JSON:\n\n` +
    `${JSON.stringify(base)}\n\n` +
    `Änderungsauftrag:\n${instruction}\n\n` +
    `Gib das VOLLSTÄNDIGE Dokument erneut aus. Übernimm jeden Titel, Block und Text, ` +
    `den der Auftrag nicht betrifft, unverändert und wörtlich; ändere ausschließlich, ` +
    `was verlangt ist. Lass nichts weg und fasse nichts zusammen.`
  );
}
