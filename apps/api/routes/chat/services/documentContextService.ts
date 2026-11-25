import { stripHtmlTags } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { getQdrantDocumentService } from '../../../services/document-services/DocumentSearchService/index.js';
import { projectSharedContentIdsSql } from '../../../services/groups/projectSharedContent.js';
import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DocumentContextService');

const SMALL_DOC_THRESHOLD = 4000;

export interface DocumentContextResult {
  text: string | null;
  totalChars: number;
  documents: Array<{ id: string; title: string; text: string }>;
}

/**
 * Fetch document context for referenced documents.
 * Validates read access (own, or shared into one of the user's Projekte),
 * retrieves full text, and determines injection strategy:
 * - Small docs (<4000 chars total): returns full text for context injection
 * - Large docs (>=4000 chars): returns null text (signal to use search scoping)
 */
export async function fetchDocumentContext(
  userId: string,
  documentIds: string[]
): Promise<DocumentContextResult> {
  if (!documentIds.length) {
    return { text: null, totalChars: 0, documents: [] };
  }

  const postgres = getPostgresInstance();
  const readable = (await postgres.query(
    `SELECT id, title, user_id FROM documents
      WHERE id = ANY($2) AND deleted_at IS NULL AND user_id IS NOT NULL
        AND (user_id = $1 OR id::text IN ${projectSharedContentIdsSql('documents', '$1')})`,
    [userId, documentIds]
  )) as Array<{ id: string; title: string; user_id: string }>;

  const readableIds = new Set(readable.map((d) => d.id));
  const validIds = documentIds.filter((id) => readableIds.has(id));

  if (validIds.length === 0) {
    log.warn(`[DocumentContext] No valid documents found for user ${userId}`);
    return { text: null, totalChars: 0, documents: [] };
  }

  if (validIds.length < documentIds.length) {
    log.warn(
      `[DocumentContext] ${documentIds.length - validIds.length} document(s) not readable by user`
    );
  }

  const titleMap = new Map(readable.map((d) => [d.id, d.title]));

  // Chunks carry their uploader's `user_id`, and the full-text read filters on
  // it — a file shared into a Projekt is read under its owner's id, one call
  // per owner, so the Qdrant filter stays exact.
  const idsByOwner = new Map<string, string[]>();
  for (const doc of readable) {
    idsByOwner.set(doc.user_id, [...(idsByOwner.get(doc.user_id) ?? []), doc.id]);
  }
  const documentSearchService = getQdrantDocumentService();
  const results = await Promise.all(
    [...idsByOwner].map(([ownerId, ids]) =>
      documentSearchService.getMultipleDocumentsFullText(ownerId, ids)
    )
  );
  const bulkResult = {
    documents: results.flatMap((r) => r.documents),
    errors: results.flatMap((r) => r.errors),
  };

  const documents: Array<{ id: string; title: string; text: string }> = [];
  let totalChars = 0;

  for (const doc of bulkResult.documents) {
    const title = titleMap.get(doc.id) || 'Unbekannt';
    documents.push({ id: doc.id, title, text: doc.fullText });
    totalChars += doc.totalCharsReconstructed;
  }

  for (const err of bulkResult.errors) {
    log.warn(`[DocumentContext] Failed to retrieve document ${err.documentId}: ${err.error}`);
  }

  if (totalChars < SMALL_DOC_THRESHOLD) {
    const text = documents.map((d) => `### ${d.title}\n\n${d.text}`).join('\n\n---\n\n');
    log.info(
      `[DocumentContext] Small doc mode: ${totalChars} chars from ${documents.length} doc(s)`
    );
    return { text, totalChars, documents };
  }

  log.info(
    `[DocumentContext] Large doc mode: ${totalChars} chars from ${documents.length} doc(s) — using search scoping`
  );
  return { text: null, totalChars, documents };
}

export interface TextContextResult {
  text: string | null;
  totalChars: number;
  count: number;
}

/**
 * A saved text is readable when the user owns it or when it is shared into a
 * Projekt the user actively belongs to. `$1` is the user id.
 */
const readableTextWhere = `(user_id = $1 OR id::text IN ${projectSharedContentIdsSql('user_documents', '$1')})`;

/** Titles of the saved texts this user may read — the chips a reload restores. */
export async function readSavedTextTitles(
  userId: string,
  textIds: readonly string[]
): Promise<Array<{ id: string; title: string }>> {
  if (!textIds.length) return [];
  return getPostgresInstance().query(
    `SELECT id, title FROM user_documents WHERE ${readableTextWhere} AND id = ANY($2) AND is_active = true AND deleted_at IS NULL`,
    [userId, textIds]
  );
}

/**
 * Fetch saved text context for referenced user_documents.
 * These are always small enough to inject directly (social posts, press releases, etc.).
 */
export async function fetchTextContext(
  userId: string,
  textIds: string[]
): Promise<TextContextResult> {
  if (!textIds.length) {
    return { text: null, totalChars: 0, count: 0 };
  }

  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT id, title, content FROM user_documents WHERE ${readableTextWhere} AND id = ANY($2) AND is_active = true AND deleted_at IS NULL`,
    [userId, textIds]
  )) as Array<{ id: string; title: string; content: string }>;

  if (rows.length === 0) {
    log.warn(`[TextContext] No valid texts found for user ${userId}`);
    return { text: null, totalChars: 0, count: 0 };
  }

  const sections = rows.map((row) => {
    const plainText = stripHtmlTags(row.content || '');
    return `### ${row.title}\n\n${plainText}`;
  });

  const text = sections.join('\n\n---\n\n');
  log.info(`[TextContext] Injecting ${rows.length} text(s), ${text.length} chars`);

  return { text, totalChars: text.length, count: rows.length };
}
