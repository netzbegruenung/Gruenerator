/**
 * Document statistics operations
 * Handles aggregated statistics and user text retrieval
 */

import type { DocumentStats, UserTextDocument } from './types.js';

/**
 * Get user's document statistics
 */
export async function getDocumentStats(
  postgres: any,
  userId: string
): Promise<DocumentStats> {
  try {
    await postgres.ensureInitialized();

    const stats = await postgres.queryOne(`
      SELECT
        COUNT(*) as total_documents,
        COUNT(CASE WHEN source_type = 'manual' THEN 1 END) as manual_documents,
        COUNT(CASE WHEN source_type = 'wolke' THEN 1 END) as wolke_documents,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_documents,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_documents,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_documents,
        SUM(vector_count) as total_vectors
      FROM documents
      WHERE user_id = $1
    `, [userId]);

    return {
      totalDocuments: parseInt(stats.total_documents) || 0,
      manualDocuments: parseInt(stats.manual_documents) || 0,
      wolkeDocuments: parseInt(stats.wolke_documents) || 0,
      completedDocuments: parseInt(stats.completed_documents) || 0,
      processingDocuments: parseInt(stats.processing_documents) || 0,
      failedDocuments: parseInt(stats.failed_documents) || 0,
      totalVectorCount: parseInt(stats.total_vectors) || 0
    };
  } catch (error) {
    console.error('[PostgresDocumentService] Error getting document stats:', error);
    throw new Error('Failed to get document statistics');
  }
}

/**
 * Get user texts from user_documents table
 */
export async function getUserTexts(
  postgres: any,
  userId: string
): Promise<UserTextDocument[]> {
  try {
    await postgres.ensureInitialized();

    const query = `
      SELECT id, title, content, document_type, created_at, updated_at
      FROM user_documents
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `;

    const texts = await postgres.query(query, [userId], { table: 'user_documents' });

    // Transform to match frontend expectations and calculate word count
    const transformedTexts: UserTextDocument[] = texts.map((text: any) => {
      const plainText = (text.content || '').replace(/<[^>]*>/g, '').trim();
      const wordCount = plainText.split(/\s+/).filter((word: string) => word.length > 0).length;

      return {
        id: text.id,
        title: text.title,
        content: text.content,
        document_type: text.document_type,
        created_at: text.created_at,
        updated_at: text.updated_at,
        word_count: wordCount,
        character_count: plainText.length
      };
    });

    return transformedTexts;
  } catch (error) {
    console.error('[PostgresDocumentService] Error getting user texts:', error);
    throw new Error('Failed to get user texts');
  }
}
