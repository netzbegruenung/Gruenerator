/**
 * Document metadata CRUD operations
 * Handles saving, updating, retrieving, and deleting document metadata
 */

import type { DocumentMetadata, DocumentRecord, DocumentUpdateData, DeleteResult, BulkDeleteResult } from './types.js';
import { parseMetadata } from '../../routes/documents/helpers.js';

/**
 * Save document metadata (no file content)
 */
export async function saveDocumentMetadata(
  postgres: any,
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
      metadata: metadata.additionalMetadata ? JSON.stringify(metadata.additionalMetadata) : null
    };

    const document = await postgres.insert('documents', documentData);
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
  postgres: any,
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
    const updateData: any = {};
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
        ...updates.additionalMetadata
      });
    }

    const result = await postgres.update(
      'documents',
      updateData,
      { id: documentId, user_id: userId }
    );

    console.log(`[PostgresDocumentService] Document ${documentId} updated`);
    return result.data[0];
  } catch (error) {
    console.error('[PostgresDocumentService] Error updating document metadata:', error);
    throw error;
  }
}

/**
 * Get documents by source type for a user
 */
export async function getDocumentsBySourceType(
  postgres: any,
  userId: string,
  sourceType: string | null = null
): Promise<DocumentRecord[]> {
  try {
    await postgres.ensureInitialized();

    let query = 'SELECT * FROM documents WHERE user_id = $1';
    let params: any[] = [userId];

    if (sourceType) {
      query += ' AND source_type = $2';
      params.push(sourceType);
    }

    query += ' ORDER BY created_at DESC';

    const documents = await postgres.query(query, params, { table: 'documents' });
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
  postgres: any,
  documentId: string,
  userId: string
): Promise<DocumentRecord | null> {
  try {
    await postgres.ensureInitialized();

    const document = await postgres.queryOne(
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
  postgres: any,
  documentId: string,
  userId: string
): Promise<DeleteResult> {
  try {
    await postgres.ensureInitialized();

    const result = await postgres.delete('documents', {
      id: documentId,
      user_id: userId
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
  postgres: any,
  documentIds: string[],
  userId: string
): Promise<BulkDeleteResult> {
  try {
    await postgres.ensureInitialized();

    // Build query for bulk delete with user ownership check
    const placeholders = documentIds.map((_, index) => `$${index + 2}`).join(',');
    const query = `DELETE FROM documents WHERE user_id = $1 AND id IN (${placeholders}) RETURNING id`;

    const result = await postgres.query(query, [userId, ...documentIds]);

    console.log(`[PostgresDocumentService] Bulk deleted ${result.length} documents for user ${userId}`);
    return {
      success: true,
      deletedCount: result.length,
      deletedIds: result.map((row: any) => row.id)
    };
  } catch (error) {
    console.error('[PostgresDocumentService] Error bulk deleting documents:', error);
    throw new Error('Failed to bulk delete documents');
  }
}
