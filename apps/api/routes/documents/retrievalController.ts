/**
 * Retrieval Controller - Document retrieval, stats, and delete operations
 *
 * Handles:
 * - GET /user - Get user documents with enrichment
 * - GET /combined-content - Get documents + texts in parallel
 * - GET /by-source/:sourceType - Filter by source type
 * - GET /stats - Get document statistics
 * - GET /:id/content - Get single document content
 * - DELETE /:id - Delete single document
 * - DELETE /bulk - Bulk delete documents
 */

import express, { Router, Response } from 'express';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { DocumentSearchService } from '../../services/document-services/DocumentSearchService/index.js';
import { createLogger } from '../../utils/logger.js';
import { enrichDocumentWithPreview } from './helpers.js';
import type { DocumentRequest, BulkDeleteRequestBody, GetDocumentsBySourceQuery } from './types.js';

const log = createLogger('documents:retrieval');
const router: Router = express.Router();

// Initialize services
const postgresDocumentService = getPostgresDocumentService();
const documentSearchService = new DocumentSearchService();

/**
 * GET /user - Get user documents with enrichment
 */
router.get('/user', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    // Get user's document mode preference (defaults to manual)
    const userMode = await postgresDocumentService.getUserDocumentMode(userId);

    // Use PostgreSQL + Qdrant exclusively (no more Supabase fallback)
    const documents = await postgresDocumentService.getDocumentsBySourceType(userId, null);

    // Get first chunks from Qdrant for documents that need previews
    const documentIds = documents.map(doc => doc.id);
    const firstChunksResult = await documentSearchService.getDocumentFirstChunks(userId, documentIds);
    const firstChunks = firstChunksResult.chunks || {};

    // Enrich with all content fields for frontend access
    const enrichedDocs = documents.map(doc => enrichDocumentWithPreview(doc, firstChunks));

    // Sort documents by created_at
    enrichedDocs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      success: true,
      data: enrichedDocs,
      meta: {
        count: enrichedDocs.length,
        userMode: userMode,
        source: 'postgres'
      },
      message: `Found ${enrichedDocs.length} documents`
    });

  } catch (error) {
    log.error('[GET /user] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to fetch documents'
    });
  }
});

/**
 * GET /combined-content - Get combined user content (documents + texts) for improved performance
 */
router.get('/combined-content', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    log.debug(`[GET /combined-content] Fetching combined content for user: ${userId}`);

    // Fetch documents and texts in parallel for better performance
    const [documents, texts] = await Promise.all([
      postgresDocumentService.getDocumentsBySourceType(userId, null),
      postgresDocumentService.getUserTexts(userId)
    ]);

    // Get first chunks from Qdrant for documents that need previews
    const documentIds = documents.map(doc => doc.id);
    const firstChunksResult = await documentSearchService.getDocumentFirstChunks(userId, documentIds);
    const firstChunks = firstChunksResult.chunks || {};

    // Enrich documents with all content fields for frontend access
    const enrichedDocs = documents.map(doc => enrichDocumentWithPreview(doc, firstChunks));

    // Sort both documents and texts by created_at
    enrichedDocs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    texts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    log.debug(`[GET /combined-content] Returning ${enrichedDocs.length} documents and ${texts.length} texts`);

    res.json({
      success: true,
      data: {
        documents: enrichedDocs,
        texts: texts
      },
      meta: {
        documentCount: enrichedDocs.length,
        textCount: texts.length,
        totalCount: enrichedDocs.length + texts.length,
        source: 'postgres'
      },
      message: `Found ${enrichedDocs.length} documents and ${texts.length} texts`
    });

  } catch (error) {
    log.error('[GET /combined-content] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to fetch combined content'
    });
  }
});

/**
 * GET /by-source/:sourceType - Get documents by source type
 */
router.get('/by-source/:sourceType', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { sourceType } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    // Validate source type
    if (sourceType && !['manual', 'wolke'].includes(sourceType)) {
      res.status(400).json({
        success: false,
        message: 'Invalid source type. Must be "manual" or "wolke"'
      });
      return;
    }

    const documents = await postgresDocumentService.getDocumentsBySourceType(userId, sourceType as any);
    const enriched = documents.map((doc) => enrichDocumentWithPreview(doc, {}));

    res.json({
      success: true,
      data: enriched,
      sourceType,
      count: enriched.length
    });
  } catch (error) {
    log.error('[GET /by-source/:sourceType] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get documents by source type'
    });
  }
});

/**
 * GET /stats - Get document statistics
 */
router.get('/stats', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const stats = await postgresDocumentService.getDocumentStats(userId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    log.error('[GET /stats] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get document statistics'
    });
  }
});

/**
 * GET /:id/content - Get document content (PostgreSQL + Qdrant only)
 */
router.get('/:id/content', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    // Get document metadata from PostgreSQL
    const document = await postgresDocumentService.getDocumentById(id, userId);

    if (!document) {
      res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
      return;
    }

    // Get text content from Qdrant vectors
    let ocrText = '';
    try {
      log.debug(`[GET /:id/content] Fetching text from Qdrant for document ${id}`);
      const qdrantResult = await documentSearchService.getDocumentFullText(userId, id);
      if (qdrantResult.success && qdrantResult.fullText) {
        ocrText = qdrantResult.fullText;
        log.debug(`[GET /:id/content] Successfully retrieved ${qdrantResult.chunkCount} chunks from Qdrant for document ${id}`);
      } else {
        log.warn(`[GET /:id/content] No text found in Qdrant for document ${id}`);
      }
    } catch (qdrantError) {
      log.error(`[GET /:id/content] Error retrieving text from Qdrant for document ${id}:`, qdrantError);
      // Continue with empty text - don't fail the request
    }

    res.json({
      success: true,
      data: {
        id: document.id,
        title: document.title,
        filename: document.filename || null,
        status: document.status,
        vector_count: document.vector_count || 0,
        source_type: document.source_type,
        ocr_text: ocrText, // Always from Qdrant
        created_at: document.created_at
      }
    });

  } catch (error) {
    log.error('[GET /:id/content] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get document content'
    });
  }
});

/**
 * DELETE /:id - Delete document (PostgreSQL + Qdrant only)
 */
router.delete('/:id', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    // Delete document metadata from PostgreSQL (includes ownership check)
    await postgresDocumentService.deleteDocument(id, userId);

    // Delete document vectors from Qdrant
    try {
      await documentSearchService.deleteDocumentVectors(id, userId);
      log.debug(`[DELETE /:id] Successfully deleted vectors for document ${id}`);
    } catch (vectorError) {
      log.warn('[DELETE /:id] Vector deletion warning:', vectorError);
      // Continue even if vector deletion fails - document metadata is already deleted
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    log.error('[DELETE /:id] Error:', error);

    if ((error as Error).message.includes('not found') || (error as Error).message.includes('access denied')) {
      res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to delete document'
    });
  }
});

/**
 * DELETE /bulk - Bulk delete documents (PostgreSQL + Qdrant only)
 */
router.delete('/bulk', async (req: DocumentRequest, res: Response): Promise<void> => {
  log.debug('[DELETE /bulk] BULK DELETE ROUTE HIT - Route is accessible');
  log.debug('[DELETE /bulk] Request method:', req.method);
  log.debug('[DELETE /bulk] Request URL:', req.originalUrl);
  log.debug('[DELETE /bulk] User authenticated:', !!req.user);
  log.debug('[DELETE /bulk] User ID:', req.user?.id);
  log.debug('[DELETE /bulk] Request body:', JSON.stringify(req.body, null, 2));

  try {
    const { ids } = req.body as BulkDeleteRequestBody;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Array of document IDs is required'
      });
      return;
    }

    log.debug(`[DELETE /bulk] Bulk delete request for ${ids.length} documents from user ${userId}`);
    log.debug('[DELETE /bulk] Document IDs to delete:', ids);

    // Delete document metadata from PostgreSQL
    log.debug('[DELETE /bulk] Starting bulk delete operation...');
    const deleteResult = await postgresDocumentService.bulkDeleteDocuments(ids, userId);

    // Delete document vectors from Qdrant
    const vectorDeletePromises = deleteResult.deletedIds.map(async (documentId) => {
      try {
        await documentSearchService.deleteDocumentVectors(documentId, userId);
        return { documentId, success: true };
      } catch (error) {
        log.warn(`[DELETE /bulk] Failed to delete vectors for document ${documentId}:`, error);
        return { documentId, success: false, error: (error as Error).message };
      }
    });

    const vectorDeleteResults = await Promise.allSettled(vectorDeletePromises);
    const vectorDeleteSuccesses = vectorDeleteResults.filter(result =>
      result.status === 'fulfilled' && result.value.success
    ).length;

    log.debug(`[DELETE /bulk] Bulk delete completed: ${deleteResult.deletedCount} documents deleted, ${vectorDeleteSuccesses} vector collections deleted`);

    res.json({
      success: true,
      message: `Bulk delete completed: ${deleteResult.deletedCount} of ${ids.length} documents deleted successfully`,
      deleted_count: deleteResult.deletedCount,
      failed_ids: ids.filter(id => !deleteResult.deletedIds.includes(id)),
      total_requested: ids.length,
      deleted_ids: deleteResult.deletedIds,
      vector_cleanup: {
        vectors_deleted: vectorDeleteSuccesses,
        total_documents: deleteResult.deletedIds.length
      }
    });

  } catch (error) {
    log.error('[DELETE /bulk] Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to perform bulk delete'
    });
  }
});

export default router;
