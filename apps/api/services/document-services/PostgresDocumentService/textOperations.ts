/**
 * Document text operations
 * Handles storing and retrieving full text content in document metadata
 */

import { and, eq } from 'drizzle-orm';

import { documents } from '../../../database/schema/documents.js';
import { getDrizzleInstance } from '../../../database/services/DrizzleService.js';
import { createLogger } from '../../../utils/logger.js';

import type { DocumentMetadata, DocumentRecord } from './types.js';
import type { PostgresService } from '../../../database/services/PostgresService/PostgresService.js';

const log = createLogger('textOperations');

/**
 * Store document full text in metadata JSON
 */
export async function storeDocumentText(
  postgres: PostgresService,
  documentId: string,
  userId: string,
  text: string
): Promise<{ success: boolean; textLength: number }> {
  try {
    await postgres.ensureInitialized();

    // Check if document exists and user owns it
    const db = getDrizzleInstance();
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
      .limit(1);

    const document = rows[0];

    if (!document) {
      throw new Error('Document not found or access denied');
    }

    const existingMetadata: Record<string, unknown> = document.metadata ?? {};

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

    log.debug(
      `[PostgresDocumentService] Stored full text for document ${documentId} (${text.length} chars)`
    );
    return { success: true, textLength: text.length };
  } catch (error) {
    log.error('[PostgresDocumentService] Error storing document text:', { error });
    throw error;
  }
}

/**
 * Retrieve document full text from metadata JSON
 */
export async function getDocumentText(
  postgres: PostgresService,
  documentId: string,
  userId: string
): Promise<{ success: boolean; text: string; textLength: number; storedAt: string }> {
  try {
    await postgres.ensureInitialized();

    const db = getDrizzleInstance();
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
      .limit(1);

    const document = rows[0];

    if (!document) {
      throw new Error('Document not found or access denied');
    }

    const metadata: Record<string, unknown> = document.metadata ?? {};
    const fullText = typeof metadata.full_text === 'string' ? metadata.full_text : '';

    return {
      success: true,
      text: fullText,
      textLength: fullText.length,
      storedAt:
        typeof metadata.stored_at === 'string'
          ? metadata.stored_at
          : document.created_at instanceof Date
            ? document.created_at.toISOString()
            : new Date().toISOString(),
    };
  } catch (error) {
    log.error('[PostgresDocumentService] Error retrieving document text:', { error });
    throw error;
  }
}

/**
 * Create document with text content (text-only system)
 */
export async function createDocumentWithText(
  postgres: PostgresService,
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
    log.debug(`[PostgresDocumentService] Created document with text: ${document.id}`);

    return document as DocumentRecord;
  } catch (error) {
    log.error('[PostgresDocumentService] Error creating document with text:', { error });
    throw new Error('Failed to create document with text');
  }
}
