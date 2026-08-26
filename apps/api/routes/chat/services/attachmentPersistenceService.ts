/**
 * Attachment Persistence Service
 *
 * Handles persistence of attachment metadata and summaries across chat messages.
 * Allows users to reference documents uploaded in earlier messages.
 *
 * Flow:
 * 1. When a user uploads a document, we extract text (OCR) and use it immediately
 * 2. After responding, we save the attachment metadata + extracted text to PostgreSQL
 * 3. In background, we generate a summary of the document
 * 4. For subsequent messages, we load summaries of all thread attachments
 */

import { randomUUID } from 'node:crypto';

import { generateText } from 'ai';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { chunkAndEmbedText } from '../../../services/document-services/DocumentProcessingService/index.js';
import { getQdrantDocumentService } from '../../../services/document-services/DocumentSearchService/DocumentSearchService.js';
import { visionService } from '../../../services/vision/VisionService.js';
import { applyContextCap } from '../../../utils/contextCap.js';
import { createLogger } from '../../../utils/logger.js';
import { reportBackgroundError } from '../../../utils/reportBackgroundError.js';
import { generateContentHash } from '../../../utils/validation/hash.js';
import { getIntermediateModel } from '../agents/providers.js';

import { isTabularAttachment } from './attachmentProcessingService.js';

const log = createLogger('AttachmentPersistenceService');

const SUMMARY_MAX_TOKENS = 400;
const MAX_ATTACHMENTS_IN_CONTEXT = 5;

/**
 * Prose documents whose extracted text exceeds this get chunked + embedded into
 * Qdrant so follow-up turns retrieve them via RAG (executeMultiDocFanout) instead
 * of re-injecting truncated full text. Smaller docs stay full-context (cheaper,
 * exact). Matches OpenWebUI's dual-mode (small=full, large=RAG). ~5k tokens.
 */
export const RAG_ATTACHMENT_THRESHOLD_CHARS = 20000;

/**
 * Content identity of one attachment, within one thread.
 *
 * Text documents are identified by their extracted text — the same file pasted
 * or uploaded twice IS the same document, whatever the client called it. Images
 * and other binaries have no extracted text, so they fall back to name + size;
 * that is weaker (two different photos of the same byte length would collide)
 * but it is scoped to a single thread, and the cost of a false match is one
 * skipped duplicate rather than lost data.
 *
 * Must stay in sync with the backfill expression in
 * `migrations/chat_thread_attachments_content_hash.sql`.
 */
export function attachmentContentHash(params: {
  extractedText: string | null;
  name: string;
  sizeBytes: number;
}): string {
  const text = params.extractedText?.trim();
  return text
    ? generateContentHash(text)
    : generateContentHash(`${params.name}:${params.sizeBytes}`);
}

export interface ThreadAttachment {
  id: string;
  name: string;
  mimeType: string;
  isImage: boolean;
  /** Full extracted document text — re-injected verbatim on follow-up turns so
   *  the model can keep answering about the file (not just the short summary). */
  extractedText: string | null;
  /** Qdrant document id when a large prose doc was embedded — follow-up turns
   *  retrieve it via RAG instead of re-injecting its truncated full text. */
  documentId: string | null;
  summary: string | null;
  /** Ob für diesen Anhang die ORIGINALBYTES in `file_data` liegen. Nur dann kann
   *  ein späterer Turn die Datei selbst wieder anfassen (Tabellen-Reload,
   *  `fill_pdf_form`) — geschrieben wird die Spalte nur für tabellarische
   *  Anhänge und für PDFs, die `isFillablePdf` als Formular erkannt hat
   *  (attachmentProcessingService). Ein PDF ohne Bytes ist damit ein PDF, von
   *  dem beim Upload feststand, dass es kein ausfüllbares Formular ist. */
  hasFileData: boolean;
  createdAt: Date;
}

interface SaveAttachmentParams {
  threadId: string;
  messageId: string | null;
  userId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  extractedText: string | null;
  /** Page count from OCR (PDFs only) — display metadata for attachment chips. */
  pageCount?: number;
  /** Base64 image bytes (images only) — used to generate a persistent vision
   *  description so follow-up turns can reason about the image. */
  imageData?: string;
  /** Base64 raw bytes (tabular files only) — persisted so the in-browser pandas
   *  interpreter can be rehydrated after a thread reload. */
  fileData?: string;
  /** Qdrant id when this file was ALREADY vectorized in this turn
   *  (`enrichContext`). Written straight into the row so nobody has to mint a
   *  second id for the same bytes afterwards. */
  documentId?: string;
}

/**
 * Save a thread attachment after processing.
 * The extracted text is stored for potential re-processing,
 * and summary generation is triggered asynchronously.
 */
export async function saveThreadAttachment(params: SaveAttachmentParams): Promise<string> {
  const {
    threadId,
    messageId,
    userId,
    name,
    mimeType,
    sizeBytes,
    isImage,
    extractedText,
    pageCount,
    imageData,
    fileData,
    documentId,
  } = params;

  const postgres = getPostgresInstance();
  const contentHash = attachmentContentHash({ extractedText, name, sizeBytes });

  // ON CONFLICT against the partial unique index on (thread_id, content_hash).
  // The client re-sends the bytes on any turn whose last user message still
  // carries the file (edit-resubmit, regenerate, a repeated paste), and without
  // this each of those turns added a row — which the prompt builder then
  // injected AGAIN in full, and which paid for its own LLM summary.
  const result = await postgres.query(
    `INSERT INTO chat_thread_attachments
     (thread_id, message_id, user_id, name, mime_type, size_bytes, is_image, extracted_text, page_count, file_data, document_id, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (thread_id, content_hash) WHERE thread_id IS NOT NULL AND content_hash IS NOT NULL
     DO NOTHING
     RETURNING id`,
    [
      threadId,
      messageId,
      userId,
      name,
      mimeType,
      sizeBytes,
      isImage,
      extractedText,
      pageCount ?? null,
      fileData ?? null,
      documentId ?? null,
      contentHash,
    ]
  );

  // Empty result = the row was already there. Return the existing id and, above
  // all, do NOT start another summary run for bytes we have already described.
  if (result.length === 0) {
    const existing = await postgres.query(
      `SELECT id FROM chat_thread_attachments WHERE thread_id = $1 AND content_hash = $2 LIMIT 1`,
      [threadId, contentHash]
    );
    const existingId = (existing[0] as { id: string } | undefined)?.id;
    if (existingId) {
      log.info(
        `[AttachmentPersistence] ${name} already stored for thread ${threadId} — reusing ${existingId}`
      );
      return existingId;
    }
    // Should not happen: DO NOTHING fired but the row is gone. Fall through with
    // a fresh id rather than throwing in a post-response path.
    log.warn(`[AttachmentPersistence] Conflict on ${name} but no existing row found`);
    return randomUUID();
  }

  const attachmentId = (result[0] as { id: string }).id;
  log.info(`[AttachmentPersistence] Saved attachment ${name} for thread ${threadId}`);

  if (isImage && imageData) {
    // Vision-describe the image once, in the background, and store it as the
    // attachment summary — this is what gives later text-only turns a memory of
    // the image (respondNode's `formatThreadAttachmentsContext` surfaces it as
    // "FRÜHERE BILDER").
    generateImageSummary(attachmentId, imageData, mimeType).catch((err) => {
      reportBackgroundError(err, { job: 'attachment-image-summary', attachmentId });
    });
  } else if (extractedText && extractedText.length > 100 && !isImage) {
    generateAttachmentSummary(attachmentId, extractedText).catch((err) => {
      reportBackgroundError(err, { job: 'attachment-summary', attachmentId });
    });
  }

  return attachmentId;
}

/**
 * Get all thread attachments for a thread.
 *
 * Picks the `limit` MOST RECENT rows (`ORDER BY created_at DESC`) but returns
 * them oldest-first — the `reverse()` below is load-bearing, and the two steps
 * mean different things: DESC decides WHICH attachments survive the limit,
 * ascending order decides how they read in a prompt.
 *
 * This doc comment said "ordered by creation date descending" until 14.08.2026
 * and sent a reviewer down exactly that path.
 */
export async function getThreadAttachments(
  threadId: string,
  limit: number = MAX_ATTACHMENTS_IN_CONTEXT
): Promise<ThreadAttachment[]> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT id, name, mime_type, is_image, extracted_text, document_id, summary, created_at,
            file_data IS NOT NULL AS has_file_data
     FROM chat_thread_attachments
     WHERE thread_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [threadId, limit]
  );

  const attachments = result.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    mimeType: row.mime_type as string,
    isImage: row.is_image as boolean,
    extractedText: row.extracted_text as string | null,
    documentId: row.document_id as string | null,
    summary: row.summary as string | null,
    hasFileData: row.has_file_data === true,
    createdAt: row.created_at as Date,
  }));

  attachments.reverse();

  log.debug(
    `[AttachmentPersistence] Loaded ${attachments.length} attachments for thread ${threadId}`
  );
  return attachments;
}

/**
 * Generate a concise summary of an attachment's content.
 * This runs asynchronously after the initial response is sent.
 */
export async function generateAttachmentSummary(
  attachmentId: string,
  extractedText: string
): Promise<string> {
  log.info(`[AttachmentPersistence] Generating summary for attachment ${attachmentId}...`);

  const systemPrompt = `Du bist ein Assistent der Dokumente zusammenfasst. Erstelle eine prägnante deutsche Zusammenfassung des folgenden Dokuments.

Fokussiere dich auf:
- Das Hauptthema und den Zweck des Dokuments
- Die wichtigsten Informationen, Argumente oder Entscheidungen
- Relevante Zahlen, Daten oder Fakten
- Schlussfolgerungen oder Handlungsempfehlungen

Halte die Zusammenfassung sehr kompakt (max. 150 Wörter). Beginne direkt mit dem Inhalt, nicht mit "Das Dokument...".`;

  const textToSummarize =
    extractedText.length > 15000
      ? applyContextCap(extractedText, 15000, 'attachment:summaryInput', false) +
        '\n\n[... Text gekürzt ...]'
      : extractedText;

  try {
    const result = await generateText({
      model: getIntermediateModel('heavy'),
      system: systemPrompt,
      prompt: textToSummarize,
      maxOutputTokens: SUMMARY_MAX_TOKENS,
      temperature: 0.3,
    });

    const summary = result.text;

    const postgres = getPostgresInstance();
    await postgres.query(`UPDATE chat_thread_attachments SET summary = $1 WHERE id = $2`, [
      summary,
      attachmentId,
    ]);

    log.info(
      `[AttachmentPersistence] Saved summary for attachment ${attachmentId}: ${summary.length} chars`
    );
    return summary;
  } catch (error) {
    log.error(`[AttachmentPersistence] Failed to generate summary for ${attachmentId}:`, error);
    throw error;
  }
}

/**
 * Generate a persistent vision description of an image attachment and store it
 * as the attachment summary. Runs asynchronously after the response is sent so
 * follow-up turns can reference the image without re-sending the pixels.
 */
export async function generateImageSummary(
  attachmentId: string,
  imageData: string,
  mimeType: string
): Promise<string> {
  log.info(`[AttachmentPersistence] Generating vision summary for image ${attachmentId}...`);

  const imageSource = imageData.startsWith('data:')
    ? imageData
    : `data:${mimeType};base64,${imageData}`;

  try {
    const description = await visionService.describeImage(imageSource, {
      maxTokens: SUMMARY_MAX_TOKENS,
    });

    const postgres = getPostgresInstance();
    await postgres.query(`UPDATE chat_thread_attachments SET summary = $1 WHERE id = $2`, [
      description,
      attachmentId,
    ]);

    log.info(
      `[AttachmentPersistence] Saved vision summary for image ${attachmentId}: ${description.length} chars`
    );
    return description;
  } catch (error) {
    log.error(
      `[AttachmentPersistence] Failed to generate vision summary for ${attachmentId}:`,
      error
    );
    throw error;
  }
}

/**
 * Get the full extracted text for an attachment (for re-processing).
 */
export async function getAttachmentText(attachmentId: string): Promise<string | null> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT extracted_text FROM chat_thread_attachments WHERE id = $1`,
    [attachmentId]
  );

  if (result.length === 0) {
    return null;
  }

  return (result[0] as { extracted_text: string | null }).extracted_text;
}

/**
 * Chunk + embed a large prose attachment into the Qdrant `documents` collection
 * under a freshly-minted document id, then store that id on the attachment row.
 * Follow-up turns add this id to `documentChatIds` so `executeMultiDocFanout`
 * retrieves the relevant chunks per query — the same RAG path used for @dokument
 * chat. Runs in the background after the first response (like the summary).
 */
export async function embedThreadAttachmentForRag(params: {
  attachmentId: string;
  userId: string;
  name: string;
  extractedText: string;
}): Promise<string> {
  const { attachmentId, userId, name, extractedText } = params;
  const documentId = randomUUID();

  const { chunks, embeddings } = await chunkAndEmbedText(extractedText, { title: name });
  await getQdrantDocumentService().storeDocumentVectors(userId, documentId, chunks, embeddings, {
    sourceType: 'chat_attachment',
    title: name,
    filename: name,
  });

  const postgres = getPostgresInstance();
  await postgres.query(`UPDATE chat_thread_attachments SET document_id = $1 WHERE id = $2`, [
    documentId,
    attachmentId,
  ]);

  log.info(
    `[AttachmentPersistence] Embedded attachment ${name} as document ${documentId} (${chunks.length} vectors)`
  );
  return documentId;
}

/**
 * Load the raw bytes of a thread's tabular attachments (CSV/Excel/ODS) so the
 * frontend can rehydrate the in-browser pandas interpreter after a reload.
 * Ownership is enforced by user_id.
 *
 * `file_data` is NOT tabular-only any more — fillable PDFs are stored in the
 * same column for fill_pdf_form. Without the mimeType filter below they would
 * be staged into the Pyodide FS and fed to pandas.
 */
export async function getThreadTabularFiles(
  threadId: string,
  userId: string
): Promise<Array<{ name: string; mimeType: string; data: string }>> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT name, mime_type, file_data
     FROM chat_thread_attachments
     WHERE thread_id = $1 AND user_id = $2 AND file_data IS NOT NULL
     ORDER BY created_at ASC`,
    [threadId, userId]
  );

  return result
    .map((row) => ({
      name: row.name as string,
      mimeType: row.mime_type as string,
      data: row.file_data as string,
    }))
    .filter((row) => isTabularAttachment(row.name, row.mimeType));
}

/**
 * Raw bytes of a thread's fillable PDF attachments, for the PDF form tools on
 * follow-up turns (the current turn still has them in `processedMeta`).
 * Ownership is enforced by user_id. Newest first: a re-uploaded form under the
 * same name should resolve to the latest version.
 */
export async function getThreadPdfFiles(
  threadId: string,
  userId: string
): Promise<Array<{ name: string; data: string }>> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT name, file_data
     FROM chat_thread_attachments
     WHERE thread_id = $1 AND user_id = $2 AND file_data IS NOT NULL
       AND mime_type = 'application/pdf'
     ORDER BY created_at DESC`,
    [threadId, userId]
  );

  return result.map((row) => ({
    name: row.name as string,
    data: row.file_data as string,
  }));
}

/**
 * Delete the Qdrant vectors of a thread's embedded (RAG) attachments before the
 * thread row is removed. The DB rows are dropped by CASCADE, but Qdrant is a
 * separate store and would otherwise leak orphaned vectors.
 *
 * Safe by construction: each delete is filtered by BOTH the attachment's
 * document_id (a random per-attachment UUID) AND the owning user_id, so it can
 * never touch another document's or another user's vectors. Best-effort — a
 * Qdrant hiccup is logged but must not block thread deletion.
 *
 * Must be called BEFORE the thread row is deleted (the document_ids are read
 * from chat_thread_attachments, which CASCADE-deletes with the thread).
 */
export async function deleteThreadAttachmentVectors(
  threadId: string,
  userId: string
): Promise<void> {
  try {
    const postgres = getPostgresInstance();

    const rows = await postgres.query(
      `SELECT document_id FROM chat_thread_attachments
       WHERE thread_id = $1 AND user_id = $2 AND document_id IS NOT NULL`,
      [threadId, userId]
    );
    if (rows.length === 0) return;

    const service = getQdrantDocumentService();
    for (const row of rows) {
      const documentId = row.document_id as string;
      try {
        await service.deleteDocumentVectors(documentId, userId);
      } catch (err) {
        reportBackgroundError(err, { job: 'attachment-vector-cleanup', threadId, documentId });
      }
    }
    log.info(
      `[AttachmentPersistence] Cleaned up ${rows.length} embedded-attachment vector set(s) for thread ${threadId}`
    );
  } catch (err) {
    // Never let vector cleanup block thread deletion — the DB rows still cascade.
    reportBackgroundError(err, { job: 'attachment-vector-cleanup', threadId });
  }
}

/**
 * Delete all attachments for a thread (used when thread is deleted).
 * Note: This is handled by CASCADE in the database, but provided for explicit cleanup.
 */
export async function deleteThreadAttachments(threadId: string): Promise<void> {
  const postgres = getPostgresInstance();

  await postgres.query(`DELETE FROM chat_thread_attachments WHERE thread_id = $1`, [threadId]);

  log.info(`[AttachmentPersistence] Deleted all attachments for thread ${threadId}`);
}
