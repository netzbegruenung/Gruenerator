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

import { generateText } from 'ai';
import { getModel } from '../agents/providers.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('AttachmentPersistenceService');

const SUMMARY_MAX_TOKENS = 400;
const MAX_ATTACHMENTS_IN_CONTEXT = 5;

export interface ThreadAttachment {
  id: string;
  name: string;
  mimeType: string;
  isImage: boolean;
  summary: string | null;
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
  } = params;

  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `INSERT INTO chat_thread_attachments
     (thread_id, message_id, user_id, name, mime_type, size_bytes, is_image, extracted_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [threadId, messageId, userId, name, mimeType, sizeBytes, isImage, extractedText]
  );

  const attachmentId = (result[0] as { id: string }).id;
  log.info(`[AttachmentPersistence] Saved attachment ${name} for thread ${threadId}`);

  if (extractedText && extractedText.length > 100 && !isImage) {
    generateAttachmentSummary(attachmentId, extractedText).catch((err) => {
      log.error(`[AttachmentPersistence] Failed to generate summary for ${attachmentId}:`, err);
    });
  }

  return attachmentId;
}

/**
 * Get all thread attachments for a thread.
 * Returns the most recent attachments, ordered by creation date descending.
 */
export async function getThreadAttachments(
  threadId: string,
  limit: number = MAX_ATTACHMENTS_IN_CONTEXT
): Promise<ThreadAttachment[]> {
  const postgres = getPostgresInstance();

  const result = await postgres.query(
    `SELECT id, name, mime_type, is_image, summary, created_at
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
    summary: row.summary as string | null,
    createdAt: row.created_at as Date,
  }));

  attachments.reverse();

  log.debug(`[AttachmentPersistence] Loaded ${attachments.length} attachments for thread ${threadId}`);
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

  const textToSummarize = extractedText.length > 15000
    ? extractedText.slice(0, 15000) + '\n\n[... Text gekürzt ...]'
    : extractedText;

  try {
    const result = await generateText({
      model: getModel('litellm', 'gpt-oss:120b'),
      system: systemPrompt,
      prompt: textToSummarize,
      maxOutputTokens: SUMMARY_MAX_TOKENS,
      temperature: 0.3,
    });

    const summary = result.text;

    const postgres = getPostgresInstance();
    await postgres.query(
      `UPDATE chat_thread_attachments SET summary = $1 WHERE id = $2`,
      [summary, attachmentId]
    );

    log.info(`[AttachmentPersistence] Saved summary for attachment ${attachmentId}: ${summary.length} chars`);
    return summary;
  } catch (error) {
    log.error(`[AttachmentPersistence] Failed to generate summary for ${attachmentId}:`, error);
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
 * Delete all attachments for a thread (used when thread is deleted).
 * Note: This is handled by CASCADE in the database, but provided for explicit cleanup.
 */
export async function deleteThreadAttachments(threadId: string): Promise<void> {
  const postgres = getPostgresInstance();

  await postgres.query(
    `DELETE FROM chat_thread_attachments WHERE thread_id = $1`,
    [threadId]
  );

  log.info(`[AttachmentPersistence] Deleted all attachments for thread ${threadId}`);
}

/**
 * Format thread attachments as context for the system message.
 * Used when building the response to include previous document context.
 */
export function formatThreadAttachmentsContext(attachments: ThreadAttachment[]): string {
  if (attachments.length === 0) {
    return '';
  }

  const docs = attachments
    .filter((a) => !a.isImage && a.summary)
    .map((a, i) => `${i + 1}. **${a.name}**: ${a.summary}`)
    .join('\n');

  if (!docs) {
    return '';
  }

  return `

## FRÜHERE DOKUMENTE IN DIESEM GESPRÄCH

${docs}

---
Nutze diese Dokumentinhalte wenn der Nutzer sich darauf bezieht (z.B. "das PDF", "das Dokument", etc.).`;
}
