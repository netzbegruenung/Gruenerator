/**
 * Attachment Processing Service
 *
 * Handles processing of chat attachments:
 * - Separates images from documents
 * - Extracts text from documents via OCR
 * - Injects image attachments into AI messages for vision models
 */

import { OCRService } from '../../../services/OcrService/index.js';
import { createLogger } from '../../../utils/logger.js';

import { describeWorkbookSheets } from './xlsxSheetNames.js';

import type {
  ProcessedAttachment,
  ImageAttachment,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('AttachmentProcessing');

const ocrService = new OCRService();

export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * The composer converts a large paste into this synthetic text attachment —
 * see `packages/chat/src/lib/pastedText.ts`. The name is wire-frozen (F0):
 * shipped clients keep sending it, so it doubles as the detection key here.
 */
export const PASTED_TEXT_ATTACHMENT_NAME = 'Eingefügter Text.txt';

/** Is this attachment the composer's synthetic paste file? */
export function isPastedTextAttachment(name: string, mimeType: string): boolean {
  return name === PASTED_TEXT_ATTACHMENT_NAME && mimeType === 'text/plain';
}

/**
 * When the composer text is empty, the paste IS the prompt: return its decoded
 * text plus the attachment list without the paste files, so the caller can
 * promote the text into the user message instead of the untrusted-material
 * channel (whose hierarchy rule forbids executing instructions found there —
 * the model then answers "du hast mir keine Aufgabe gestellt", QA 08/2026).
 * Returns null when there is typed text (the paste stays reference material)
 * or no promotable paste.
 */
export function extractPromotablePasteText(
  attachments: ProcessedAttachment[] | undefined,
  typedText: string
): { pasteText: string; remaining: ProcessedAttachment[] } | null {
  if (!attachments?.length || typedText.trim().length > 0) return null;
  const pasteText = attachments
    .filter((a) => isPastedTextAttachment(a.name, a.type))
    .map((a) => Buffer.from(a.data, 'base64').toString('utf8').trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
  if (pasteText.length === 0) return null;
  return {
    pasteText,
    remaining: attachments.filter((a) => !isPastedTextAttachment(a.name, a.type)),
  };
}

/** Max raw bytes of a tabular file we persist for reload-rehydration (~2 MB).
 *  Larger sheets keep full-text context but no reload-compute (avoids row bloat). */
const MAX_TABULAR_BYTES_PERSISTED = 2 * 1024 * 1024;

/** Max raw bytes of a fillable PDF we persist so `fill_pdf_form` still works on
 *  follow-up turns. Its own (larger) cap: form PDFs carry page graphics, and
 *  unlike sheets they are only ever stored when they actually have form fields. */
const MAX_PDF_BYTES_PERSISTED = 8 * 1024 * 1024;

/**
 * Does this PDF carry an interactive AcroForm? Only fillable PDFs get their raw
 * bytes stored — otherwise every uploaded brochure would bloat the attachment
 * table for a capability it can never use. Fail-closed: an unreadable PDF is
 * treated as not fillable.
 */
async function isFillablePdf(bytes: Buffer): Promise<boolean> {
  try {
    const { readFormFields } = await import('../../../services/pdfForm/pdfFormService.js');
    return (await readFormFields(bytes)).length > 0;
  } catch {
    return false;
  }
}

/**
 * Detect a tabular attachment (CSV/Excel/ODS) by name or MIME type. Mirrors the
 * frontend `isTabularFile` in `@gruenerator/chat` spreadsheetSetup — kept in sync
 * so the backend can steer the model toward the in-browser pandas interpreter
 * whenever the composer has bridged a spreadsheet into the `df` session store.
 */
export function isTabularAttachment(name: string, mimeType: string): boolean {
  const lower = name.toLowerCase();
  return (
    mimeType === 'text/csv' ||
    lower.endsWith('.csv') ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    mimeType.includes('spreadsheetml.sheet') ||
    mimeType.includes('ms-excel')
  );
}

export interface ProcessedAttachmentMeta {
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  extractedText: string | null;
  /** Page count from the OCR extraction (PDFs only) — display metadata for the
   *  attachment chips, persisted so it survives a thread reload. */
  pageCount?: number;
  /** Base64 image bytes, set for images only — used to generate a persistent
   *  vision description (summary) for multi-turn image memory. */
  imageData?: string;
  /** Base64 raw bytes. Set for tabular files (CSV/Excel/ODS), so the in-browser
   *  pandas interpreter can be rehydrated after a thread reload, and for
   *  fillable PDFs, so `fill_pdf_form` still has the document on follow-up
   *  turns. Consumers MUST filter by mimeType — see getThreadTabularFiles. */
  fileData?: string;
  /** Qdrant document id, set by `enrichContext` once it vectorized this file in
   *  THIS turn. Its only job is to stop the post-response persistence from
   *  embedding the same bytes a second time under a second id — see
   *  `saveThreadAttachmentsFromMeta`. Absent means "nobody indexed it yet". */
  documentId?: string;
}

/**
 * Process attachments: separate images from documents, extract text from documents.
 */
export async function processAttachments(
  attachments: ProcessedAttachment[] | undefined,
  requestId: string
): Promise<{
  attachmentContext: string;
  imageAttachments: ImageAttachment[];
  processedMeta: ProcessedAttachmentMeta[];
  /** Dieses Turns Kandidaten für die PDF-Formularwerkzeuge (`streamContext` →
   *  `pdfFormAttachments`): nur PDFs, deren AcroForm-Prüfung Felder gefunden
   *  hat. Am Ort des Urteils gebaut — gleiches Objekt wie die Prüfung —, damit
   *  keine zweite Liste per Name oder Position gepaart werden muss (beides über
   *  Namenskollisionen bzw. das client-gesendete `isImage`-Flag angreifbar,
   *  Review auf #2862). Bewusst OHNE den Grössendeckel der Persistenz: ein
   *  übergrosses Formular ist in DIESEM Turn ausfüllbar, die Bytes liegen im
   *  Request. NICHT nach Redis persistieren (Multi-MB base64) — siehe
   *  pipelineStateStore. */
  pdfFormCandidates: Array<{ name: string; data: string }>;
}> {
  if (!attachments || attachments.length === 0) {
    return {
      attachmentContext: '',
      imageAttachments: [],
      processedMeta: [],
      pdfFormCandidates: [],
    };
  }

  const imageAttachments: ImageAttachment[] = [];
  const documentTexts: string[] = [];
  const processedMeta: ProcessedAttachmentMeta[] = [];
  const pdfFormCandidates: Array<{ name: string; data: string }> = [];

  for (const attachment of attachments) {
    if (IMAGE_MIME_TYPES.has(attachment.type)) {
      imageAttachments.push({
        name: attachment.name,
        type: attachment.type,
        data: attachment.data,
      });
      processedMeta.push({
        name: attachment.name,
        mimeType: attachment.type,
        sizeBytes: attachment.size,
        isImage: true,
        extractedText: null,
        imageData: attachment.data,
      });
      log.info(`[${requestId}] Added image attachment: ${attachment.name}`);
    } else {
      // Keep the raw bytes of tabular files so the pandas interpreter survives a
      // reload (rehydrated server-side). Non-tabular docs only need their text.
      // Cap the stored bytes so a huge sheet can't bloat the row — larger files
      // still get full-text context, just no reload-compute.
      const rawBytes = Math.floor((attachment.data.length * 3) / 4);
      const isTabular = isTabularAttachment(attachment.name, attachment.type);
      // The AcroForm probe runs for EVERY PDF, not only the persistable ones:
      // a positive verdict makes this attachment a form-tool candidate for THIS
      // turn (#2835). Storage (see MAX_PDF_BYTES_PERSISTED) additionally
      // applies the size cap, so fill_pdf_form can reach the document on later
      // turns.
      const pdfIsFillable =
        !isTabular &&
        attachment.type === 'application/pdf' &&
        (await isFillablePdf(Buffer.from(attachment.data, 'base64')));
      if (pdfIsFillable) {
        pdfFormCandidates.push({ name: attachment.name, data: attachment.data });
      }
      const keepPdf = pdfIsFillable && rawBytes <= MAX_PDF_BYTES_PERSISTED;
      const persistedData =
        (isTabular && rawBytes <= MAX_TABULAR_BYTES_PERSISTED) || keepPdf
          ? attachment.data
          : undefined;
      // Multi-sheet workbooks: the sheet map is read straight from the xlsx
      // zip (deterministic — OCR text extraction gives no guarantee the sheet
      // names survive) and prepended to the extracted text, so the pandas
      // codegen knows what `sheets['Name']` can address on every turn.
      const isXlsxAttachment =
        attachment.name.toLowerCase().endsWith('.xlsx') ||
        attachment.type.includes('spreadsheetml.sheet');
      const sheetNote = isXlsxAttachment
        ? describeWorkbookSheets(Buffer.from(attachment.data, 'base64'))
        : null;

      try {
        const result = await ocrService.extractTextFromBase64(
          attachment.data,
          attachment.name,
          attachment.type
        );

        // Page counts are only meaningful for PDFs — the OCR service reports a
        // hardcoded 1 for directly decoded text files, which would render a
        // misleading "1 Seite" on every .txt/.csv chip.
        const pageCount =
          attachment.type === 'application/pdf' && result.pageCount > 0
            ? result.pageCount
            : undefined;

        if (result.text && result.text.length > 0) {
          const text = sheetNote ? `${sheetNote}\n${result.text}` : result.text;
          // Label makes the inline full-text path distinguishable from a
          // vectorized doc's RAG chunks (see contextEnrichmentService's
          // SMALL_DOC_VECTORIZATION_THRESHOLD routing) — the model otherwise
          // can't tell whether it's seeing everything or an excerpt.
          documentTexts.push(`### ${attachment.name} (Volltext-Auszug)\n\n${text}`);
          processedMeta.push({
            name: attachment.name,
            mimeType: attachment.type,
            sizeBytes: attachment.size,
            isImage: false,
            extractedText: text,
            ...(pageCount != null && { pageCount }),
            ...(persistedData != null && { fileData: persistedData }),
          });
          log.info(`[${requestId}] Extracted ${result.text.length} chars from: ${attachment.name}`);
        } else {
          // OCR succeeded but found nothing (e.g. a scan without a text layer).
          // Without this branch the file vanished from both the context and
          // processedMeta — so it was never even persisted.
          log.warn(`[${requestId}] No text extracted from: ${attachment.name}`);
          documentTexts.push(`### ${attachment.name}\n\n[Kein Text erkannt]`);
          processedMeta.push({
            name: attachment.name,
            mimeType: attachment.type,
            sizeBytes: attachment.size,
            isImage: false,
            extractedText: null,
            ...(pageCount != null && { pageCount }),
            ...(persistedData != null && { fileData: persistedData }),
          });
        }
      } catch (error) {
        log.error(`[${requestId}] Failed to extract text from ${attachment.name}:`, error);
        documentTexts.push(`### ${attachment.name}\n\n[Fehler beim Extrahieren des Textes]`);
        processedMeta.push({
          name: attachment.name,
          mimeType: attachment.type,
          sizeBytes: attachment.size,
          isImage: false,
          extractedText: null,
          ...(persistedData != null && { fileData: persistedData }),
        });
      }
    }
  }

  return {
    attachmentContext: documentTexts.join('\n\n---\n\n'),
    imageAttachments,
    processedMeta,
    pdfFormCandidates,
  };
}

/**
 * Inject image attachments into the last user message for vision model processing.
 */
export function injectImageAttachments(
  messages: ModelMessage[],
  imageAttachments: ImageAttachment[],
  requestId: string
): ModelMessage[] {
  if (imageAttachments.length === 0) return messages;

  log.info(`[${requestId}] Adding ${imageAttachments.length} images to message for vision model`);

  const result = [...messages];
  let lastUserIdx = -1;
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx >= 0) {
    const lastUserMsg = result[lastUserIdx];
    const textContent =
      typeof lastUserMsg.content === 'string'
        ? lastUserMsg.content
        : Array.isArray(lastUserMsg.content)
          ? lastUserMsg.content
              .filter((p: { type: string; text?: string }) => p.type === 'text')
              .map((p: { type: string; text?: string }) => p.text)
              .join('')
          : '';

    const multimodalContent: Array<
      { type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }
    > = [{ type: 'text' as const, text: textContent }];

    for (const img of imageAttachments) {
      multimodalContent.push({
        type: 'image' as const,
        image: Buffer.from(img.data, 'base64').toString('base64'),
        mimeType: img.type,
      });
    }

    result[lastUserIdx] = {
      role: 'user',
      content: multimodalContent,
    };
  }

  return result;
}
