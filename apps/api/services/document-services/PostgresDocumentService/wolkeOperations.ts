/**
 * Wolke-specific document operations
 * Handles integration with Wolke file storage system
 */

import type { DocumentRecord } from './types.js';
import type { PostgresService } from '../../../database/services/PostgresService/PostgresService.js';

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

    const document = await postgres.queryOne<DocumentRecord>(
      'SELECT * FROM documents WHERE user_id = $1 AND wolke_share_link_id = $2 AND wolke_file_path = $3',
      [userId, shareLinkId, filePath]
    );

    return document;
  } catch (error) {
    console.error('[PostgresDocumentService] Error getting document by Wolke file:', error);
    throw error;
  }
}
