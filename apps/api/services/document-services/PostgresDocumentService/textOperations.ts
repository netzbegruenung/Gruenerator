/**
 * Document text operations
 * Handles storing and retrieving full text content in document metadata
 */

import type { DocumentMetadata, DocumentRecord, DocumentWithText } from './types.js';

/**
 * Store document full text in metadata JSON
 */
export async function storeDocumentText(
  postgres: any,
  documentId: string,
  userId: string,
  text: string
): Promise<{ success: boolean; textLength: number }> {
  try {
    await postgres.ensureInitialized();

    // Check if document exists and user owns it
    const document = await postgres.queryOne(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId],
      { table: 'documents' }
    );

    if (!document) {
      throw new Error('Document not found or access denied');
    }

    // Parse existing metadata
    let existingMetadata: Record<string, any> = {};
    try {
      existingMetadata = document.metadata ? JSON.parse(document.metadata) : {};
    } catch (e) {
      existingMetadata = {};
    }

    // Update document with full text in metadata
    const updates = {
      metadata: JSON.stringify({
        ...existingMetadata,
        full_text: text,
        text_length: text.length,
        stored_at: new Date().toISOString(),
      }),
    };

    await postgres.update('documents', updates, {
      id: documentId,
      user_id: userId,
    });

    console.log(
      `[PostgresDocumentService] Stored full text for document ${documentId} (${text.length} chars)`
    );
    return { success: true, textLength: text.length };
  } catch (error) {
    console.error('[PostgresDocumentService] Error storing document text:', error);
    throw error;
  }
}

/**
 * Retrieve document full text from metadata JSON
 */
export async function getDocumentText(
  postgres: any,
  documentId: string,
  userId: string
): Promise<{ success: boolean; text: string; textLength: number; storedAt: string }> {
  try {
    await postgres.ensureInitialized();

    const document = await postgres.queryOne(
      'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
      [documentId, userId],
      { table: 'documents' }
    );

    if (!document) {
      throw new Error('Document not found or access denied');
    }

    // Parse metadata to extract text
    let metadata: Record<string, any> = {};
    try {
      metadata = document.metadata ? JSON.parse(document.metadata) : {};
    } catch (e) {
      metadata = {};
    }

    const fullText = metadata.full_text || '';

    return {
      success: true,
      text: fullText,
      textLength: fullText.length,
      storedAt: metadata.stored_at || document.created_at,
    };
  } catch (error) {
    console.error('[PostgresDocumentService] Error retrieving document text:', error);
    throw error;
  }
}

/**
 * Create document with text content (text-only system)
 */
export async function createDocumentWithText(
  postgres: any,
  userId: string,
  metadata: DocumentMetadata,
  text: string
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
      vector_count: 0, // Will be updated after vector generation
      file_size: text ? text.length : 0,
      status: 'pending',
      metadata: JSON.stringify({
        ...metadata.additionalMetadata,
        full_text: text,
        text_length: text ? text.length : 0,
        created_at: new Date().toISOString(),
      }),
    };

    const document = await postgres.insert('documents', documentData);
    console.log(`[PostgresDocumentService] Created document with text: ${document.id}`);

    return document;
  } catch (error) {
    console.error('[PostgresDocumentService] Error creating document with text:', error);
    throw new Error('Failed to create document with text');
  }
}
