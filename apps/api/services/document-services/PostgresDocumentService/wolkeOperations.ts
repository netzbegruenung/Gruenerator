/**
 * Wolke-specific document operations
 * Handles integration with Wolke file storage system
 */

import { and, eq } from 'drizzle-orm';

import { documents, type Document } from '../../../database/schema/documents.js';
import { getDrizzleInstance } from '../../../database/services/DrizzleService.js';
import { createLogger } from '../../../utils/logger.js';

import type { DocumentRecord } from './types.js';
import type { PostgresService } from '../../../database/services/PostgresService/PostgresService.js';

const log = createLogger('wolkeOperations');

function drizzleRowToDocumentRecord(row: Document): DocumentRecord {
  return {
    id: row.id,
    user_id: row.user_id ?? '',
    title: row.title,
    filename: row.filename,
    file_path: row.file_path,
    file_size: row.file_size ?? 0,
    page_count: row.page_count ?? 0,
    status: row.status ?? 'pending',
    ocr_text: row.ocr_text,
    created_at:
      row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at ?? ''),
    updated_at:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at ?? ''),
    ocr_method: row.ocr_method ?? 'tesseract',
    source_url: row.source_url,
    document_type: row.document_type ?? 'upload',
    metadata: row.metadata ?? null,
    markdown_content: row.markdown_content,
    group_id: row.group_id,
    source_type: row.source_type ?? 'manual',
    wolke_share_link_id: row.wolke_share_link_id,
    wolke_file_path: row.wolke_file_path,
    wolke_etag: row.wolke_etag,
    vector_count: row.vector_count ?? 0,
    last_synced_at:
      row.last_synced_at instanceof Date ? row.last_synced_at.toISOString() : row.last_synced_at,
    group_wolke_share_id: row.group_wolke_share_id,
  };
}

/**
 * Get document by Wolke file path (for duplicate checking)
 */
export async function getDocumentByWolkeFile(
  postgres: PostgresService,
  userId: string,
  shareLinkId: string,
  filePath: string
): Promise<DocumentRecord | null> {
  try {
    await postgres.ensureInitialized();
    const db = getDrizzleInstance();

    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.user_id, userId),
          eq(documents.wolke_share_link_id, shareLinkId),
          eq(documents.wolke_file_path, filePath)
        )
      )
      .limit(1);

    return rows[0] ? drizzleRowToDocumentRecord(rows[0]) : null;
  } catch (error) {
    log.error('[PostgresDocumentService] Error getting document by Wolke file:', { error });
    throw error;
  }
}
