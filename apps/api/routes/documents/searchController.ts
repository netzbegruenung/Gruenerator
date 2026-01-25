/**
 * Search Controller - All search operations
 *
 * Handles:
 * - POST / - Main search endpoint (hybrid/text/vector)
 * - POST /content - Search within specific documents
 * - GET /stats - Search performance stats
 * - POST /hybrid-test - Hybrid search testing endpoint
 */

import express, { Router, Request, Response } from 'express';
import { DocumentSearchService } from '../../services/document-services/DocumentSearchService/index.js';
import { getDocumentContentService } from '../../services/document-services/DocumentContentService/index.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { createLogger } from '../../utils/logger.js';
import type {
  DocumentRequest,
  SearchDocumentsRequestBody,
  SearchContentRequestBody,
  SearchResultCompatible,
  HybridTestResult,
} from './types.js';

const log = createLogger('documents:search');
const router: Router = express.Router();

// Initialize services
const documentSearchService = new DocumentSearchService();
const documentContentService = getDocumentContentService();
const postgresDocumentService = getPostgresDocumentService();

/**
 * POST / - Search documents (Qdrant vector search only)
 */
router.post('/', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const {
      query,
      limit = 5,
      searchMode = 'hybrid',
      documentIds,
    } = req.body as SearchDocumentsRequestBody;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate query
    if (!query || !query.trim()) {
      res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
      return;
    }

    log.debug(`[POST /] Search request: "${query}" (user: ${userId}, mode: ${searchMode})`);

    let searchResult;

    // Choose search method based on mode
    if (searchMode === 'hybrid') {
      // Use hybrid search for best results
      searchResult = await documentSearchService.hybridSearch(query.trim(), userId, {
        limit: Math.min(Math.max(1, limit), 20),
        vectorWeight: 0.7,
        textWeight: 0.3,
        documentIds: Array.isArray(documentIds) && documentIds.length ? documentIds : undefined,
      });
    } else if (searchMode === 'text') {
      // Full-text only search
      searchResult = await documentSearchService.textSearch(query.trim(), userId, {
        limit: Math.min(Math.max(1, limit), 20),
        documentIds: Array.isArray(documentIds) && documentIds.length ? documentIds : undefined,
      });
    } else {
      // Fallback to hybrid for unknown modes
      searchResult = await documentSearchService.hybridSearch(query.trim(), userId, {
        limit: Math.min(Math.max(1, limit), 20),
        vectorWeight: 0.7,
        textWeight: 0.3,
        documentIds: Array.isArray(documentIds) && documentIds.length ? documentIds : undefined,
      });
    }

    // Guard against validation errors returning no results array
    const safeResults = Array.isArray(searchResult?.results) ? searchResult.results : [];

    // Transform results for backward compatibility
    const compatibleResults: SearchResultCompatible[] = safeResults.map((doc) => ({
      id: doc.document_id,
      title: doc.title || '',
      filename: doc.filename || '',
      relevantText: doc.relevant_content,
      created_at: doc.created_at || '',
      similarity_score: doc.similarity_score,
      relevance_info: doc.relevance_info,
      search_type: searchResult.searchType,
    }));

    // If validation error occurred, return a safe response with empty data
    if (!searchResult?.success && !Array.isArray(searchResult?.results)) {
      res.status(400).json({
        success: false,
        data: [],
        message: searchResult?.message || 'Validation error',
        searchType: searchResult?.searchType || 'error',
        query: query.trim(),
      });
      return;
    }

    res.json({
      success: searchResult.success,
      data: compatibleResults,
      message: searchResult.message,
      searchType: searchResult.searchType,
      query: searchResult.query,
    });
  } catch (error) {
    log.error('[POST /] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to search documents',
    });
  }
});

/**
 * POST /content - Search for relevant content within specific documents
 * This endpoint is used for intelligent document content extraction in forms
 */
router.post('/content', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { query, documentIds, limit = 5, mode = 'hybrid' } = req.body as SearchContentRequestBody;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate input
    if (!query || !query.trim()) {
      res.status(400).json({ error: 'Search query is required' });
      return;
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({ error: 'Document IDs array is required' });
      return;
    }

    // Use document content service
    const result = await documentContentService.searchDocumentContent(userId, {
      query,
      documentIds,
      limit,
      mode,
    });

    res.json(result);
  } catch (error) {
    log.error('[POST /content] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /stats - Get search performance stats (PostgreSQL + Qdrant only)
 */
router.get('/stats', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get user document stats from PostgreSQL
    const docStats = await postgresDocumentService.getDocumentStats(userId);

    // Get vector stats from Qdrant
    const vectorStats = await documentSearchService.getUserVectorStats(userId);

    res.json({
      success: true,
      data: {
        documents: docStats,
        vectors: vectorStats,
        optimizations: {
          dynamic_thresholds: true,
          enhanced_scoring: true,
          german_enhancement: true,
          hybrid_search: true,
          multi_stage_pipeline: true,
          qdrant_vector_search: true,
        },
      },
    });
  } catch (error) {
    log.error('[GET /stats] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get search stats',
    });
  }
});

/**
 * POST /hybrid-test - Test hybrid search endpoint
 */
router.post('/hybrid-test', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { query, limit = 5 } = req.body;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate query
    if (!query || !query.trim()) {
      res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
      return;
    }

    log.debug(`[POST /hybrid-test] Testing hybrid search: "${query}"`);

    // Run both search methods for comparison
    const [vectorResult, hybridResult] = await Promise.all([
      documentSearchService.searchDocuments(query.trim(), userId, { limit }),
      documentSearchService.hybridSearch(query.trim(), userId, { limit }),
    ]);

    const result: HybridTestResult = {
      query: query.trim(),
      vector_search: {
        results: vectorResult.results,
        search_type: vectorResult.searchType,
        message: vectorResult.message,
      },
      hybrid_search: {
        results: hybridResult.results,
        search_type: hybridResult.searchType,
        message: hybridResult.message,
        stats: (hybridResult as any).stats,
      },
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    log.error('[POST /hybrid-test] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to test hybrid search',
    });
  }
});

export default router;
