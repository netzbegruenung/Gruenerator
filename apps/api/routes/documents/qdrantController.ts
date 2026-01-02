/**
 * Qdrant Controller - Qdrant-specific operations
 *
 * Handles:
 * - GET /:documentId/full-text - Get document full text from Qdrant
 * - POST /bulk/full-text - Bulk full-text retrieval
 * - GET /list - List documents from Qdrant
 * - GET /stats - Qdrant vector statistics
 */

import express, { Router, Response } from 'express';
import { DocumentSearchService } from '../../services/document-services/DocumentSearchService/index.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { createLogger } from '../../utils/logger.js';
import type { DocumentRequest, BulkFullTextRequestBody, QdrantListQuery } from './types.js';

const log = createLogger('documents:qdrant');
const router: Router = express.Router();

// Initialize services
const documentSearchService = new DocumentSearchService();
const postgresDocumentService = getPostgresDocumentService();

/**
 * GET /:documentId/full-text - Get document full text from Qdrant chunks
 */
router.get('/:documentId/full-text', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    log.debug(`[GET /:documentId/full-text] Retrieving full text for document: ${documentId}`);

    // First verify the document belongs to the user (from PostgreSQL metadata)
    const documentMeta = await postgresDocumentService.getDocumentById(documentId, userId);

    if (!documentMeta) {
      res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
      return;
    }

    // Get full text from Qdrant
    const result = await documentSearchService.getDocumentFullText(userId, documentId);

    if (!result.success) {
      res.status(404).json({
        success: false,
        message: result.error || 'Document text not found'
      });
      return;
    }

    log.debug(`[GET /:documentId/full-text] Retrieved text with ${result.chunkCount} chunks`);

    res.json({
      success: true,
      data: {
        id: documentId,
        fullText: result.fullText,
        chunkCount: result.chunkCount,
        metadata: {
          // Merge with PostgreSQL metadata
          ...documentMeta,
          // Include any additional metadata from result if it exists
          ...((result as any).metadata || {})
        }
      }
    });
  } catch (error) {
    log.error(`[GET /:documentId/full-text] Error:`, error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to retrieve document text'
    });
  }
});

/**
 * POST /bulk/full-text - Get multiple documents with full text (bulk retrieval)
 */
router.post('/bulk/full-text', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { documentIds } = req.body as BulkFullTextRequestBody;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    // Validate input
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'documentIds array is required'
      });
      return;
    }

    log.debug(`[POST /bulk/full-text] Retrieving full text for ${documentIds.length} documents`);

    // Verify all documents belong to the user
    const documentsMetadata = await Promise.all(
      documentIds.map(docId => postgresDocumentService.getDocumentById(docId, userId))
    );

    // Filter out null results (documents not found or access denied)
    const validDocumentIds = documentsMetadata
      .map((meta, index) => meta ? documentIds[index] : null)
      .filter(Boolean) as string[];

    if (validDocumentIds.length === 0) {
      res.status(404).json({
        success: false,
        message: 'No accessible documents found'
      });
      return;
    }

    // Get full text for valid documents from Qdrant
    const result = await documentSearchService.getMultipleDocumentsFullText(userId, validDocumentIds);

    log.debug(`[POST /bulk/full-text] Retrieved ${result.documents.length} documents, ${result.errors.length} errors`);

    res.json({
      success: true,
      data: {
        documents: result.documents,
        errors: result.errors,
        stats: {
          requested: documentIds.length,
          accessible: validDocumentIds.length,
          retrieved: result.documents.length,
          failed: result.errors.length
        }
      }
    });
  } catch (error) {
    log.error('[POST /bulk/full-text] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to retrieve documents text'
    });
  }
});

/**
 * GET /list - Get documents list from Qdrant (alternative to PostgreSQL-based listing)
 */
router.get('/list', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { sourceType, limit } = req.query as QdrantListQuery;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }


    log.debug(`[GET /list] Retrieving documents list from Qdrant for user: ${userId}`);

    const result = await (documentSearchService as any).getUserDocumentsList(userId, {
      sourceType: sourceType || null,
      limit: limit ? parseInt(limit) : 1000
    });

    if (!result.success) {
      throw new Error('Failed to retrieve documents from Qdrant');
    }

    log.debug(`[GET /list] Retrieved ${result.documents.length} documents from Qdrant`);

    res.json({
      success: true,
      data: result.documents,
      meta: {
        source: 'qdrant',
        count: result.documents.length,
        totalCount: result.totalCount
      }
    });
  } catch (error) {
    log.error('[GET /list] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to retrieve documents from Qdrant'
    });
  }
});

/**
 * GET /stats - Get Qdrant vector statistics for user
 */
router.get('/stats', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    log.debug(`[GET /stats] Getting vector stats for user: ${userId}`);

    const stats = await documentSearchService.getUserVectorStats(userId);

    log.debug(`[GET /stats] User has ${stats.totalVectors} vectors across ${stats.uniqueDocuments} documents`);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    log.error('[GET /stats] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get vector statistics'
    });
  }
});

export default router;
