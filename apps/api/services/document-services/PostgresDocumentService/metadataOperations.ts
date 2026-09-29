/**
 * Document metadata CRUD operations
 * Handles saving, updating, retrieving, and deleting document metadata
 */

import { and, desc, eq } from 'drizzle-orm';

import { documents, type Document } from '../../../database/schema/documents.js';
import { getDrizzleInstance } from '../../../database/services/DrizzleService.js';
import { notTrashed } from '../../../database/trash.js';
import { reportBackgroundError } from '../../../utils/reportBackgroundError.js';
import { type TrashCursor, trashKeysetWhere, trashOrderBy } from '../../trash/trashCursor.js';
import { removeOriginal } from '../documentOriginals.js';

import type {
  DocumentMetadata,
  DocumentRecord,
  DocumentUpdateData,
  DeleteResult,
} from './types.js';
import type { PostgresService } from '../../../database/services/PostgresService/PostgresService.js';

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
 * Save document metadata (no file content)
 */
export async function saveDocumentMetadata(
  postgres: PostgresService,
  userId: string,
  metadata: DocumentMetadata
): Promise<DocumentRecord> {
  try {
    await postgres.ensureInitialized();

    const documentData = {
      user_id: userId,
      title: metadata.title,
      filename: metadata.filename || null,
      source_type: metadata.sourceType || 'manual',
      wolke_share_link_id: metadata.wolkeShareLinkId || null,
      wolke_file_path: metadata.wolkeFilePath || null,
      wolke_etag: metadata.wolkeEtag || null,
      vector_count: metadata.vectorCount || 0,
      file_size: metadata.fileSize || 0,
      status: metadata.status || 'processing',
      source_url: metadata.sourceUrl || null,
      markdown_content: metadata.markdownContent ?? null,
      ...(metadata.pageCount !== undefined ? { page_count: metadata.pageCount } : {}),
      metadata: metadata.additionalMetadata ? JSON.stringify(metadata.additionalMetadata) : null,
    };

    const insertedData = await postgres.insert('documents', documentData);
    const row = insertedData as Record<string, unknown>;
    const createdAt =
      row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string);
    const updatedAt =
      row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at as string);
    const lastSyncedAt =
      row.last_synced_at instanceof Date
        ? row.last_synced_at.toISOString()
        : (row.last_synced_at as string | null);
    const document: DocumentRecord = {
      id: row.id as string,
      user_id: row.user_id as string,
      title: row.title as string,
      filename: row.filename as string | null,
      file_path: row.file_path as string | null,
      file_size: row.file_size as number,
      page_count: row.page_count as number,
      status: row.status as string,
      ocr_text: row.ocr_text as string | null,
      created_at: createdAt,
      updated_at: updatedAt,
      ocr_method: row.ocr_method as string,
      source_url: row.source_url as string | null,
      document_type: row.document_type as string,
      metadata: row.metadata as Record<string, unknown> | null,
      markdown_content: row.markdown_content as string | null,
      group_id: row.group_id as string | null,
      source_type: row.source_type as string,
      wolke_share_link_id: row.wolke_share_link_id as string | null,
      wolke_file_path: row.wolke_file_path as string | null,
      wolke_etag: row.wolke_etag as string | null,
      vector_count: row.vector_count as number,
      last_synced_at: lastSyncedAt,
      group_wolke_share_id: row.group_wolke_share_id as string | null,
    };
    console.log(`[PostgresDocumentService] Document metadata saved: ${document.id}`);

    return document;
  } catch (error) {
    console.error('[PostgresDocumentService] Error saving document metadata:', error);
    throw new Error('Failed to save document metadata');
  }
}

/**
 * Update document metadata
 */
export async function updateDocumentMetadata(
  postgres: PostgresService,
  documentId: string,
  userId: string,
  updates: DocumentUpdateData
): Promise<DocumentRecord> {
  try {
    await postgres.ensureInitialized();

    const db = getDrizzleInstance();

    // Ensure user owns the document
    const ownershipRows = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
      .limit(1);

    if (ownershipRows.length === 0) {
      throw new Error('Document not found or access denied');
    }

    // Prepare updates
    const updateData: Record<string, unknown> = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.vectorCount !== undefined) updateData.vector_count = updates.vectorCount;
    if (updates.wolkeEtag !== undefined) updateData.wolke_etag = updates.wolkeEtag;
    if (updates.lastSyncedAt !== undefined) updateData.last_synced_at = updates.lastSyncedAt;
    if (updates.markdownContent !== undefined)
      updateData.markdown_content = updates.markdownContent;
    if (updates.pageCount !== undefined) updateData.page_count = updates.pageCount;
    if (updates.filePath !== undefined) updateData.file_path = updates.filePath;

    // EINE Anweisung für Spalten und Metadaten. Metadaten werden in der
    // Datenbank zusammengeführt, nicht lesen-ändern-schreiben: ein langer
    // Verarbeitungslauf überschrieb sonst Tags, die in der Zwischenzeit jemand
    // setzte. Und nicht in zwei Anweisungen: stürzt der Prozess dazwischen,
    // stünden Metadaten (filePath entfernt) ohne Spalten (status). `undefined`
    // heißt wie bisher „Schlüssel entfernen".
    const params: unknown[] = [documentId, userId];
    const sets: string[] = [];
    if (updates.additionalMetadata !== undefined) {
      const patch: Record<string, unknown> = {};
      const removed: string[] = [];
      for (const [key, value] of Object.entries(updates.additionalMetadata)) {
        if (value === undefined) removed.push(key);
        else patch[key] = value;
      }
      params.push(removed, JSON.stringify(patch));
      sets.push(`metadata = (
                  CASE jsonb_typeof(metadata)
                    WHEN 'object' THEN metadata
                    WHEN 'string' THEN (metadata #>> '{}')::jsonb
                    ELSE '{}'::jsonb
                  END - $3::text[]
                ) || $4::jsonb`);
    }
    // Spaltennamen stammen aus der festen Liste oben, nie aus der Eingabe.
    for (const [column, value] of Object.entries(updateData)) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }

    const row =
      sets.length > 0
        ? ((
            await postgres.query(
              `UPDATE documents SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
              params
            )
          )[0] as Record<string, unknown>)
        : ((
            await postgres.update('documents', updateData, {
              id: documentId,
              user_id: userId,
            })
          ).data[0] as Record<string, unknown>);

    console.log(`[PostgresDocumentService] Document ${documentId} updated`);
    const createdAt =
      row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string);
    const updatedAt =
      row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at as string);
    const lastSyncedAt =
      row.last_synced_at instanceof Date
        ? row.last_synced_at.toISOString()
        : (row.last_synced_at as string | null | undefined);
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      title: row.title as string,
      filename: row.filename as string | null,
      file_path: row.file_path as string | null,
      file_size: row.file_size as number,
      page_count: row.page_count as number,
      status: row.status as string,
      ocr_text: row.ocr_text as string | null,
      created_at: createdAt,
      updated_at: updatedAt,
      ocr_method: row.ocr_method as string,
      source_url: row.source_url as string | null,
      document_type: row.document_type as string,
      metadata: row.metadata as Record<string, unknown> | null,
      markdown_content: row.markdown_content as string | null,
      group_id: row.group_id as string | null,
      source_type: row.source_type as string,
      wolke_share_link_id: row.wolke_share_link_id as string | null,
      wolke_file_path: row.wolke_file_path as string | null,
      wolke_etag: row.wolke_etag as string | null,
      vector_count: row.vector_count as number,
      last_synced_at: lastSyncedAt as string | null | undefined,
      group_wolke_share_id: row.group_wolke_share_id as string | null,
    } as DocumentRecord;
  } catch (error) {
    console.error('[PostgresDocumentService] Error updating document metadata:', error);
    throw error;
  }
}

/**
 * Get documents by source type for a user
 */
export async function getDocumentsBySourceType(
  postgres: PostgresService,
  userId: string,
  sourceType: string | null = null
): Promise<DocumentRecord[]> {
  try {
    await postgres.ensureInitialized();
    const db = getDrizzleInstance();

    const rows = await db
      .select()
      .from(documents)
      .where(
        sourceType
          ? and(
              eq(documents.user_id, userId),
              eq(documents.source_type, sourceType),
              notTrashed(documents)
            )
          : and(eq(documents.user_id, userId), notTrashed(documents))
      )
      .orderBy(desc(documents.created_at));

    return rows.map(drizzleRowToDocumentRecord);
  } catch (error) {
    console.error('[PostgresDocumentService] Error getting documents by source type:', error);
    throw new Error('Failed to get documents');
  }
}

/**
 * Get document by ID (with ownership check)
 */
export async function getDocumentById(
  postgres: PostgresService,
  documentId: string,
  userId: string
): Promise<DocumentRecord | null> {
  try {
    await postgres.ensureInitialized();
    const db = getDrizzleInstance();

    const rows = await db
      .select()
      .from(documents)
      .where(
        and(eq(documents.id, documentId), eq(documents.user_id, userId), notTrashed(documents))
      )
      .limit(1);

    return rows[0] ? drizzleRowToDocumentRecord(rows[0]) : null;
  } catch (error) {
    console.error('[PostgresDocumentService] Error getting document by ID:', error);
    throw new Error('Failed to get document');
  }
}

/**
 * Delete document metadata
 */
export async function deleteDocument(
  postgres: PostgresService,
  documentId: string,
  userId: string
): Promise<DeleteResult> {
  try {
    await postgres.ensureInitialized();

    const deleted = await postgres.query<{ file_path: string | null }>(
      'DELETE FROM documents WHERE id = $1 AND user_id = $2 RETURNING file_path',
      [documentId, userId]
    );

    if (deleted.length === 0) {
      throw new Error('Document not found or access denied');
    }
    try {
      removeOriginal(deleted[0].file_path);
    } catch (error) {
      reportBackgroundError(error, {
        job: 'document-delete',
        id: documentId,
        store: 'original_file',
      });
    }

    console.log(`[PostgresDocumentService] Document ${documentId} deleted`);
    return { success: true, deletedId: documentId };
  } catch (error) {
    console.error('[PostgresDocumentService] Error deleting document:', error);
    throw error;
  }
}

// ========================================
// Papierkorb
// ========================================
//
// A trashed document keeps its row, its Qdrant chunks and its notebook links;
// it only carries `deleted_at`. Readers hide it: SQL readers filter the column,
// Qdrant hits are hydrated against Postgres (`liveDocumentIds`). Only
// `purgeDocument` deletes the row, the vectors and the notebook links.
// Delete rights are the owner's (`documents.user_id`).

export type TrashedDocumentRow = Pick<Document, 'id' | 'title' | 'source_type'> & {
  deleted_at: Date;
};

export type TrashedDocumentLookup =
  { status: 'not_found' } | { status: 'forbidden' } | { status: 'ok'; row: TrashedDocumentRow };

/** Move the caller's live documents among `documentIds` to the Papierkorb. */
export async function trashDocuments(
  postgres: PostgresService,
  documentIds: string[],
  userId: string
): Promise<string[]> {
  if (documentIds.length === 0) return [];
  await postgres.ensureInitialized();
  const rows = await postgres.query<{ id: string }>(
    `UPDATE documents SET deleted_at = now()
     WHERE id = ANY($1) AND user_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [documentIds, userId]
  );
  return rows.map((row) => String(row.id));
}

/** Single-document form of {@link trashDocuments}; throws like the old delete did. */
export async function trashDocument(
  postgres: PostgresService,
  documentId: string,
  userId: string
): Promise<DeleteResult> {
  const trashed = await trashDocuments(postgres, [documentId], userId);
  if (trashed.length === 0) throw new Error('Document not found or access denied');
  return { success: true, deletedId: documentId };
}

/** A trashed document the user may restore or purge. */
export async function getTrashedDocument(
  postgres: PostgresService,
  documentId: string,
  userId: string
): Promise<TrashedDocumentLookup> {
  const rows = await postgres.query<TrashedDocumentRow & { user_id: string | null }>(
    `SELECT id, title, source_type, deleted_at, user_id FROM documents
     WHERE id = $1 AND deleted_at IS NOT NULL`,
    [documentId]
  );
  if (rows.length === 0) return { status: 'not_found' };
  const { user_id, ...row } = rows[0];
  if (user_id !== userId) return { status: 'forbidden' };
  return { status: 'ok', row };
}

/** Undo {@link trashDocuments}. Nothing to re-embed: the chunks never left. */
export async function restoreDocument(
  postgres: PostgresService,
  documentId: string,
  userId: string
): Promise<TrashedDocumentLookup> {
  const found = await getTrashedDocument(postgres, documentId, userId);
  if (found.status !== 'ok') return found;
  await postgres.query(
    'UPDATE documents SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL',
    [documentId]
  );
  return found;
}

export async function listTrashedDocuments(
  postgres: PostgresService,
  userId: string,
  opts: { limit: number; before: TrashCursor | null }
): Promise<TrashedDocumentRow[]> {
  const params: unknown[] = [userId];
  const keyset = trashKeysetWhere('deleted_at', 'id', opts.before, params);
  params.push(opts.limit);
  return postgres.query<TrashedDocumentRow>(
    `SELECT id, title, source_type, deleted_at FROM documents
     WHERE deleted_at IS NOT NULL AND user_id = $1 AND ${keyset}
     ORDER BY ${trashOrderBy('deleted_at', 'id')}
     LIMIT $${params.length}`,
    params
  );
}

export async function listExpiredDocuments(
  postgres: PostgresService,
  cutoff: Date,
  limit: number
): Promise<Array<{ id: string; userId: string | null }>> {
  const rows = await postgres.query<{ id: string; user_id: string | null }>(
    `SELECT id, user_id FROM documents
     WHERE deleted_at IS NOT NULL AND deleted_at < $1
     ORDER BY deleted_at LIMIT $2`,
    [cutoff, limit]
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id }));
}

/**
 * Hard-delete a trashed document: the conditional DELETE first (0 rows → a
 * restored or never-trashed document, nothing else is touched), then its
 * Qdrant chunks and notebook links — neither has a foreign key. Those go
 * best-effort: the row cannot come back, so a failure is reported, never
 * thrown. `cutoff` null purges any trashed row (purge-now).
 */
export async function purgeDocument(
  postgres: PostgresService,
  documentId: string,
  cutoff: Date | null
): Promise<boolean> {
  const deleted = await postgres.query<{
    id: string;
    user_id: string | null;
    file_path: string | null;
  }>(
    `DELETE FROM documents
     WHERE id = $1 AND deleted_at IS NOT NULL AND ($2::timestamptz IS NULL OR deleted_at < $2)
     RETURNING id, user_id, file_path`,
    [documentId, cutoff]
  );
  if (deleted.length === 0) return false;
  const ownerId = deleted[0].user_id;

  const sideStore = async (store: string, work: () => Promise<unknown>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      reportBackgroundError(error, { job: 'trash-purge', kind: 'document', id: documentId, store });
    }
  };
  if (ownerId) {
    await sideStore('document_vectors', async () => {
      const { getQdrantDocumentService } =
        await import('../DocumentSearchService/DocumentSearchService.js');
      await getQdrantDocumentService().deleteDocumentVectors(documentId, ownerId);
    });
  }
  const originalPath = deleted[0].file_path;
  if (originalPath) {
    await sideStore('original_file', async () => removeOriginal(originalPath));
  }
  await sideStore('notebook_collection_documents', async () => {
    const { NotebookQdrantHelper } =
      await import('../../../database/services/NotebookQdrantHelper.js');
    await new NotebookQdrantHelper().removeDocumentsFromAllCollections([documentId]);
  });
  return true;
}
