/**
 * Document metadata CRUD operations
 * Handles saving, updating, retrieving, and deleting document metadata
 */

import { parseMetadata } from '../../../routes/documents/helpers.js';

import type {
  DocumentMetadata,
  DocumentRecord,
  DocumentUpdateData,
  DeleteResult,
  BulkDeleteResult,
} from './types.js';
import type { PostgresService } from '../../../database/services/PostgresService/PostgresService.js';

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

    const insertedData = await postgres.insert(
      'documents',
      documentData
    );
    const row = insertedData as Record<string, unknown>;
    const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string);
    const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at as string);
    const lastSyncedAt = row.last_synced_at instanceof Date ? row.last_synced_at.toISOString() : (row.last_synced_at as string | null);
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

    // Ensure user owns the document
    const document = await postgres.queryOne(
      'SELECT id FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId]
    );

    if (!document) {
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
      const current = await postgres.queryOne(
        'SELECT metadata FROM documents WHERE id = $1 AND user_id = $2',
        [documentId, userId]
      );
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
    const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at as string);
    const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at as string);
    const lastSyncedAt = row.last_synced_at instanceof Date ? row.last_synced_at.toISOString() : (row.last_synced_at as string | null | undefined);
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

    let query = 'SELECT * FROM documents WHERE user_id = $1';
    const params: Array<string | number> = [userId];

    if (sourceType) {
      query += ' AND source_type = $2';
      params.push(sourceType);
    }

    query += ' ORDER BY created_at DESC';

    const documents = await postgres.query<DocumentRecord>(query, params, { table: 'documents' });
    return documents;
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

    const document = await postgres.queryOne<DocumentRecord>(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId],
      { table: 'documents' }
    );

    return document;
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
