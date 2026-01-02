/**
 * User library management routes
 * Handles saving texts to library, saved texts CRUD, and semantic search
 */

import express, { Router, Response } from 'express';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import authMiddlewareModule from '../../../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import { getQdrantInstance } from '../../../database/services/QdrantService.js';
import { mistralEmbeddingService } from '../../../services/mistral/index.js';
import { smartChunkDocument } from '../../../services/document-services/TextChunker/index.js';
import { createLogger } from '../../../utils/logger.js';
import type { AuthRequest, SaveToLibraryBody, SavedTextMetadataBody, SavedTextContentBody, BulkDeleteBody, SearchSavedTextsBody } from '../types.js';

const log = createLogger('userLibrary');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router: Router = express.Router();

// ============================================================================
// Helper Functions
// ============================================================================

function extractTitleFromContent(content: string): string | null {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const h2Match = content.match(/<h2[^>]*>(.*?)<\/h2>/i);
  if (h2Match && h2Match[1]) {
    return cleanTitle(h2Match[1]);
  }

  const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    return cleanTitle(h1Match[1]);
  }

  const h3Match = content.match(/<h3[^>]*>(.*?)<\/h3>/i);
  if (h3Match && h3Match[1]) {
    return cleanTitle(h3Match[1]);
  }

  const socialPlatforms = ['Twitter', 'Facebook', 'Instagram', 'LinkedIn', 'TikTok'];
  for (const platform of socialPlatforms) {
    if (content.toLowerCase().includes(platform.toLowerCase())) {
      return `${platform}-Beitrag`;
    }
  }

  const contentTypes = [
    { pattern: /tweet|twitter/i, title: 'Twitter-Beitrag' },
    { pattern: /facebook/i, title: 'Facebook-Beitrag' },
    { pattern: /instagram/i, title: 'Instagram-Beitrag' },
    { pattern: /linkedin/i, title: 'LinkedIn-Beitrag' },
    { pattern: /antrag/i, title: 'Antrag' },
    { pattern: /pressemitteilung|presse/i, title: 'Pressemitteilung' },
    { pattern: /rede/i, title: 'Rede' },
    { pattern: /wahlprogramm/i, title: 'Wahlprogramm' }
  ];

  for (const type of contentTypes) {
    if (type.pattern.test(content)) {
      return type.title;
    }
  }

  const textContent = content.replace(/<[^>]*>/g, '').trim();
  const sentences = textContent.split(/[.!?]/);
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim();
    if (firstSentence && firstSentence.length > 10 && firstSentence.length < 100) {
      return cleanTitle(firstSentence);
    }
  }

  const firstLine = textContent.split('\n')[0];
  if (firstLine && firstLine.length > 0) {
    return cleanTitle(firstLine.substring(0, 60));
  }

  return null;
}

function cleanTitle(title: string): string | null {
  if (!title) return null;

  return title
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-zA-Z0-9#]+;/g, '')
    .trim()
    .substring(0, 200);
}

const VALID_TYPES = [
  'text', 'antrag', 'social', 'universal', 'press', 'gruene_jugend', 'template',
  'instagram', 'facebook', 'twitter', 'linkedin',
  'actionIdeas', 'reelScript',
  'gruene_jugend_instagram', 'gruene_jugend_twitter', 'gruene_jugend_tiktok', 'gruene_jugend_messenger',
  'gruene_jugend_reelScript', 'gruene_jugend_actionIdeas',
  'kleine_anfrage', 'grosse_anfrage', 'rede', 'wahlprogramm',
  'pressemitteilung', 'pr_text'
];

// ============================================================================
// Save to Library
// ============================================================================

router.post('/save-to-library', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { content, title: manualTitle, type = 'universal' } = req.body as SaveToLibraryBody & { type?: string };

    if (!content) {
      res.status(400).json({
        success: false,
        message: 'Content ist erforderlich.'
      });
      return;
    }

    if (!VALID_TYPES.includes(type)) {
      res.status(400).json({
        success: false,
        message: `Ungültiger Typ: ${type}. Erlaubte Typen: ${VALID_TYPES.join(', ')}`
      });
      return;
    }

    let finalTitle = manualTitle;
    if (!finalTitle || finalTitle.trim() === '') {
      const extractedTitle = extractTitleFromContent(content);
      if (extractedTitle) {
        finalTitle = extractedTitle;
      }
    }

    if (!finalTitle || finalTitle.trim() === '') {
      finalTitle = `Gespeicherter Text vom ${new Date().toLocaleDateString('de-DE')}`;
    }

    const documentId = uuidv4();

    const plainTextContent = content.replace(/<[^>]*>/g, '').trim();
    const wordCount = plainTextContent.split(/\s+/).filter((word: string) => word.length > 0).length;
    const characterCount = plainTextContent.length;

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const data = await postgres.insert('user_documents', {
      id: documentId,
      user_id: userId,
      title: finalTitle.trim(),
      document_type: type,
      content: content.trim()
    });

    log.debug(`[User Content /save-to-library POST] Successfully saved text ${data.id} for user ${userId}`);

    setImmediate(async () => {
      try {
        const qdrant = getQdrantInstance();
        await mistralEmbeddingService.init();

        if (qdrant.isAvailable()) {
          const textForEmbedding = content.replace(/<[^>]*>/g, '').trim();

          if (textForEmbedding.length === 0) return;

          let chunks;
          if (textForEmbedding.length < 2000) {
            chunks = [{
              text: textForEmbedding,
              index: 0,
              tokens: Math.ceil(textForEmbedding.length / 4),
              metadata: {}
            }];
          } else {
            chunks = await smartChunkDocument(textForEmbedding, {
              maxTokens: 600,
              overlapTokens: 150,
              preserveSentences: true
            });
          }

          if (chunks.length === 0) return;

          const batchSize = 10;
          const allChunksWithEmbeddings: any[] = [];

          for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const texts = batch.map((chunk: any) => chunk.text);
            const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(texts, 'search_document');

            const chunksWithEmbeddings = batch.map((chunk: any, idx: number) => ({
              text: chunk.text,
              embedding: embeddings[idx],
              token_count: chunk.tokens,
              metadata: {
                title: finalTitle,
                document_type: type,
                word_count: wordCount,
                character_count: characterCount,
                chunk_of_total: `${chunk.index + 1}/${chunks.length}`,
                ...(chunk.metadata || {})
              }
            }));

            allChunksWithEmbeddings.push(...chunksWithEmbeddings);
          }

          await qdrant.indexDocumentChunks(documentId, allChunksWithEmbeddings, userId, 'user_texts');
          log.debug(`[Vectorization] Vectorized ${chunks.length} chunks for document ${documentId}`);
        }
      } catch (vectorError) {
        const err = vectorError as Error;
        log.error('[Vectorization] Failed (non-critical):', err.message);
      }
    });

    res.json({
      success: true,
      message: 'Text erfolgreich in der Bibliothek gespeichert.',
      data: {
        id: data.id,
        title: data.title,
        type: data.document_type,
        created_at: data.created_at,
        word_count: wordCount,
        character_count: characterCount
      },
      detectedTitle: manualTitle ? false : true,
      usedTitle: finalTitle
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Content /save-to-library POST] Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Speichern in der Bibliothek.',
      details: err.message
    });
  }
});

// ============================================================================
// Saved Texts CRUD
// ============================================================================

router.get('/saved-texts', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '20', type } = req.query;

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const conditions = ['user_id = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (type) {
      conditions.push(`document_type = $${paramIndex++}`);
      params.push(type);
    }

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const query = `
      SELECT id as document_id, title, content, document_type, created_at
      FROM user_documents
      WHERE ${conditions.join(' AND ')} AND is_active = true
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(parseInt(limit as string), offset);

    const data = await postgres.query(query, params, { table: 'user_documents' });

    const transformedData = data?.map((item: any) => {
      const plainText = (item.content || '').replace(/<[^>]*>/g, '').trim();
      const wordCount = plainText.split(/\s+/).filter((word: string) => word.length > 0).length;
      const characterCount = plainText.length;

      return {
        id: item.document_id,
        title: item.title,
        content: item.content || '',
        type: item.document_type,
        created_at: item.created_at,
        word_count: wordCount,
        character_count: characterCount
      };
    }) || [];

    res.json({
      success: true,
      data: transformedData,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string)
      }
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Content /saved-texts GET] Error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der gespeicherten Texte.',
      details: err.message
    });
  }
});

router.delete('/saved-texts/:id', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: 'Text-ID ist erforderlich.'
      });
      return;
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    await postgres.delete('user_documents', { id: id, user_id: userId });

    setImmediate(async () => {
      try {
        const qdrant = getQdrantInstance();
        if (qdrant.isAvailable()) {
          await qdrant.deleteDocument(id, 'user_texts');
          log.debug(`[Vector Cleanup] Removed vectors for document ${id}`);
        }
      } catch (vectorError) {
        const err = vectorError as Error;
        log.error('[Vector Cleanup] Failed (non-critical):', err.message);
      }
    });

    res.json({
      success: true,
      message: 'Text erfolgreich gelöscht.'
    });

  } catch (error) {
    const err = error as Error;
    log.error(`[User Content /saved-texts/${req.params.id} DELETE] Error:`, err.message);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen des Textes.',
      details: err.message
    });
  }
});

router.post('/saved-texts/:id/metadata', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { title, document_type } = req.body as SavedTextMetadataBody & { document_type?: string };

    if (!title && !document_type) {
      res.status(400).json({
        success: false,
        message: 'Title or document_type is required'
      });
      return;
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const existingDoc = await postgres.query(
      'SELECT id FROM user_documents WHERE id = $1 AND user_id = $2',
      [id, userId],
      { table: 'user_documents' }
    );

    if (!existingDoc.length) {
      res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
      return;
    }

    const updateData: Record<string, any> = {};
    if (title) updateData.title = title.trim();
    if (document_type) updateData.document_type = document_type;
    updateData.updated_at = new Date();

    const result = await postgres.update('user_documents', updateData, { id, user_id: userId });

    res.json({
      success: true,
      data: result,
      message: 'Document metadata updated successfully'
    });

  } catch (error) {
    const err = error as Error;
    log.error(`[User Content /saved-texts/${req.params.id}/metadata POST] Error:`, err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to update document metadata'
    });
  }
});

router.put('/saved-texts/:id/content', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { content, title } = req.body as SavedTextContentBody & { title?: string };

    if (!content) {
      res.status(400).json({
        success: false,
        message: 'Content is required'
      });
      return;
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const existingDoc = await postgres.query(
      'SELECT id, title, document_type FROM user_documents WHERE id = $1 AND user_id = $2 AND is_active = true',
      [id, userId],
      { table: 'user_documents' }
    );

    if (!existingDoc.length) {
      res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
      return;
    }

    const doc = existingDoc[0];

    const updateData: Record<string, any> = {
      content: content.trim(),
      updated_at: new Date()
    };

    if (title) {
      updateData.title = title.trim();
    }

    await postgres.update('user_documents', updateData, { id, user_id: userId });

    const plainTextContent = content.replace(/<[^>]*>/g, '').trim();
    const wordCount = plainTextContent.split(/\s+/).filter((word: string) => word.length > 0).length;
    const characterCount = plainTextContent.length;

    log.debug(`[User Content /saved-texts/${id}/content PUT] Updated content for user ${userId}`);

    setImmediate(async () => {
      try {
        const qdrant = getQdrantInstance();
        await mistralEmbeddingService.init();

        if (qdrant.isAvailable()) {
          await qdrant.deleteDocument(id, 'user_texts');

          const textForEmbedding = content.replace(/<[^>]*>/g, '').trim();
          if (textForEmbedding.length === 0) return;

          let chunks;
          if (textForEmbedding.length < 2000) {
            chunks = [{
              text: textForEmbedding,
              index: 0,
              tokens: Math.ceil(textForEmbedding.length / 4),
              metadata: {}
            }];
          } else {
            chunks = await smartChunkDocument(textForEmbedding, {
              maxTokens: 600,
              overlapTokens: 150,
              preserveSentences: true
            });
          }

          if (chunks.length === 0) return;

          const batchSize = 10;
          const allChunksWithEmbeddings: any[] = [];

          for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const texts = batch.map((chunk: any) => chunk.text);
            const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(texts, 'search_document');

            const chunksWithEmbeddings = batch.map((chunk: any, idx: number) => ({
              text: chunk.text,
              embedding: embeddings[idx],
              token_count: chunk.tokens,
              metadata: {
                title: title || doc.title,
                document_type: doc.document_type,
                word_count: wordCount,
                character_count: characterCount,
                chunk_of_total: `${chunk.index + 1}/${chunks.length}`,
                ...(chunk.metadata || {})
              }
            }));

            allChunksWithEmbeddings.push(...chunksWithEmbeddings);
          }

          await qdrant.indexDocumentChunks(id, allChunksWithEmbeddings, userId, 'user_texts');
          log.debug(`[Vectorization] Re-vectorized ${chunks.length} chunks for document ${id}`);
        }
      } catch (vectorError) {
        const err = vectorError as Error;
        log.error('[Vectorization] Re-vectorization failed (non-critical):', err.message);
      }
    });

    res.json({
      success: true,
      message: 'Content updated successfully',
      data: {
        id,
        title: title || doc.title,
        word_count: wordCount,
        character_count: characterCount,
        updated_at: new Date().toISOString()
      }
    });

  } catch (error) {
    const err = error as Error;
    log.error(`[User Content /saved-texts/${req.params.id}/content PUT] Error:`, err.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update content',
      details: err.message
    });
  }
});

router.delete('/saved-texts/bulk', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { ids } = req.body as BulkDeleteBody;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Array of text IDs is required'
      });
      return;
    }

    if (ids.length > 100) {
      res.status(400).json({
        success: false,
        message: 'Maximum 100 texts can be deleted at once'
      });
      return;
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const verifyTexts = await postgres.query(
      'SELECT id FROM user_documents WHERE user_id = $1 AND id = ANY($2) AND is_active = true',
      [userId, ids],
      { table: 'user_documents' }
    );

    const ownedIds = verifyTexts.map((text: any) => text.id);
    const unauthorizedIds = ids.filter(id => !ownedIds.includes(id));

    if (unauthorizedIds.length > 0) {
      res.status(403).json({
        success: false,
        message: `Access denied for texts: ${unauthorizedIds.join(', ')}`,
        unauthorized_ids: unauthorizedIds
      });
      return;
    }

    const result = await postgres.query(
      'UPDATE user_documents SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND id = ANY($2) AND is_active = true RETURNING id',
      [userId, ownedIds],
      { table: 'user_documents' }
    );

    const deletedIds = result.map((row: any) => row.id);
    const failedIds = ownedIds.filter((id: string) => !deletedIds.includes(id));

    if (deletedIds.length > 0) {
      setImmediate(async () => {
        try {
          const qdrant = getQdrantInstance();
          if (qdrant.isAvailable()) {
            const cleanupPromises = deletedIds.map(async (docId: string) => {
              try {
                await qdrant.deleteDocument(docId, 'user_texts');
              } catch (err) {
                const error = err as Error;
                log.error(`[Vector Cleanup] Failed for document ${docId}:`, error.message);
              }
            });

            await Promise.all(cleanupPromises);
            log.debug(`[Vector Cleanup] Bulk cleanup completed for ${deletedIds.length} documents`);
          }
        } catch (vectorError) {
          const err = vectorError as Error;
          log.error('[Vector Cleanup] Bulk cleanup failed (non-critical):', err.message);
        }
      });
    }

    res.json({
      success: true,
      message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} texts deleted successfully`,
      deleted_count: deletedIds.length,
      failed_ids: failedIds,
      total_requested: ids.length,
      deleted_ids: deletedIds
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Content /saved-texts/bulk DELETE] Error:', err.message);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to perform bulk delete of texts',
      details: err.message
    });
  }
});

// ============================================================================
// Semantic Search
// ============================================================================

router.post('/search-saved-texts', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { query, limit = 10, documentTypes = null } = req.body as SearchSavedTextsBody & { documentTypes?: string[] };

    log.debug(`[Search Saved Texts] User ${userId} searching for: "${query}"`);

    if (!query || query.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
      return;
    }

    const qdrant = getQdrantInstance();
    await mistralEmbeddingService.init();

    if (!qdrant.isAvailable()) {
      res.status(503).json({
        success: false,
        message: 'Vector search is currently unavailable'
      });
      return;
    }

    const queryEmbedding = await mistralEmbeddingService.generateEmbedding(query);

    const searchResults = await qdrant.searchDocuments(queryEmbedding, {
      userId: userId,
      limit: limit * 2,
      threshold: 0.3,
      collection: 'user_texts'
    });

    const documentScores = new Map<string, number>();
    const documentChunks = new Map<string, any[]>();

    for (const result of searchResults.results) {
      const docId = result.document_id;

      if (!documentScores.has(docId)) {
        documentScores.set(docId, result.score);
        documentChunks.set(docId, []);
      }

      if (result.score > documentScores.get(docId)!) {
        documentScores.set(docId, result.score);
      }

      documentChunks.get(docId)!.push({
        text: result.chunk_text,
        score: result.score
      });
    }

    const documentIds = Array.from(documentScores.keys());

    if (documentIds.length === 0) {
      res.json({
        success: true,
        results: [],
        query: query,
        total_found: 0
      });
      return;
    }

    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const documents = await postgres.query(
      'SELECT id as document_id, title, content, document_type, created_at FROM user_documents WHERE id = ANY($1) AND user_id = $2 AND is_active = true',
      [documentIds, userId],
      { table: 'user_documents' }
    );

    const finalResults = documents
      .map((doc: any) => {
        const plainText = (doc.content || '').replace(/<[^>]*>/g, '').trim();
        const wordCount = plainText.split(/\s+/).filter((word: string) => word.length > 0).length;
        const characterCount = plainText.length;

        return {
          ...doc,
          word_count: wordCount,
          character_count: characterCount,
          relevance_score: documentScores.get(doc.document_id),
          matching_chunks: documentChunks.get(doc.document_id)
            ?.sort((a, b) => b.score - a.score)
            .slice(0, 2)
        };
      })
      .sort((a: any, b: any) => b.relevance_score - a.relevance_score)
      .slice(0, limit);

    res.json({
      success: true,
      results: finalResults,
      query: query,
      total_found: finalResults.length
    });

  } catch (error) {
    const err = error as Error;
    log.error('[Search Saved Texts] Error:', err);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      details: err.message
    });
  }
});

export default router;
