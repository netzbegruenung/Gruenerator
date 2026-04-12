/**
 * Document metadata CRUD operations
 * Handles saving, updating, retrieving, and deleting document metadata
 */

import { and, desc, eq } from 'drizzle-orm';

import { documents, type Document } from '../../../database/schema/documents.js';
import { getDrizzleInstance } from '../../../database/services/DrizzleService.js';
import { parseMetadata } from '../../../routes/documents/helpers.js';

import type {
  DocumentMetadata,
  DocumentRecord,
  DocumentUpdateData,
  DeleteResult,
  BulkDeleteResult,
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

    if (updates.additionalMetadata !== undefined) {
      // Merge with existing metadata to avoid losing fields
      const currentRows = await db
        .select({ metadata: documents.metadata })
        .from(documents)
        .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
        .limit(1);
      const current = currentRows[0];
      const baseMeta = parseMetadata(current?.metadata);
      updateData.metadata = JSON.stringify({
        ...baseMeta,
        ...updates.additionalMetadata,
      });
    }

    const result = await postgres.update('documents', updateData, {
      id: documentId,
      user_id: userId,
    });

    console.log(`[PostgresDocumentService] Document ${documentId} updated`);
    const row = result.data[0] as Record<string, unknown>;
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
          ? and(eq(documents.user_id, userId), eq(documents.source_type, sourceType))
          : eq(documents.user_id, userId)
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
      .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
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

    const result = await postgres.delete('documents', {
      id: documentId,
      user_id: userId,
    });

    if (result.changes === 0) {
      throw new Error('Document not found or access denied');
    }

    console.log(`[PostgresDocumentService] Document ${documentId} deleted`);
    return { success: true, deletedId: documentId };
  } catch (error) {
    console.error('[PostgresDocumentService] Error deleting document:', error);
    throw error;
  }
}

/**
 * Bulk delete documents
 */
export async function bulkDeleteDocuments(
  postgres: PostgresService,
  documentIds: string[],
  userId: string
): Promise<BulkDeleteResult> {
  try {
    await postgres.ensureInitialized();

    // Build query for bulk delete with user ownership check
    const placeholders = documentIds.map((_, index) => `$${index + 2}`).join(',');
    const query = `DELETE FROM documents WHERE user_id = $1 AND id IN (${placeholders}) RETURNING id`;

    const result = await postgres.query(query, [userId, ...documentIds]);

    console.log(
      `[PostgresDocumentService] Bulk deleted ${result.length} documents for user ${userId}`
    );
    return {
      success: true,
      deletedCount: result.length,
      deletedIds: (result as Array<{ id: string }>).map((row) => row.id),
    };
  } catch (error) {
    console.error('[PostgresDocumentService] Error bulk deleting documents:', error);
    throw new Error('Failed to bulk delete documents');
  }
}
