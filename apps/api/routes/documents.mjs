import express from 'express';
import multer from 'multer';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import {
  DocumentSearchService,
  getPostgresDocumentService,
  getDocumentProcessingService,
  getDocumentContentService
} from '../services/document-services/index.js';
import { getWolkeSyncService } from '../services/wolkeSyncService.js';
import path from 'path';
import passport from '../config/passportSetup.mjs';
import { createLogger } from '../utils/logger.js';
const log = createLogger('documents');


const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Initialize services
const postgresDocumentService = getPostgresDocumentService();
const documentSearchService = new DocumentSearchService();
const qdrantDocumentService = documentSearchService; // Backward compatibility
const wolkeSyncService = getWolkeSyncService();
const documentProcessingService = getDocumentProcessingService();
const documentContentService = getDocumentContentService();

// Add Passport session middleware for documents routes
router.use(passport.session());

// Configure multer for text input (no file storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for text processing in memory
  }
});

// Add debugging middleware to all document routes
router.use((req, res, next) => {
  next();
});

// Helper: generate a short, sentence-aware content preview
function generateContentPreview(text, limit = 600) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= limit) return text;
  const truncated = text.slice(0, limit);
  const sentenceEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
  if (sentenceEnd > limit * 0.5) return truncated.slice(0, sentenceEnd + 1);
  const lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > limit * 0.6 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
}

// =============================================================================
// DOCUMENT MODE MANAGEMENT
// =============================================================================

// Get user's document mode
router.get('/mode', ensureAuthenticated, async (req, res) => {
  try {
    const mode = await postgresDocumentService.getUserDocumentMode(req.user.id);
    res.json({ mode });
  } catch (error) {
    log.error('[Documents /mode] Error getting document mode:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get document mode'
    });
  }
});

// Set user's document mode
router.post('/mode', ensureAuthenticated, async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!mode || !['manual', 'wolke'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mode. Must be "manual" or "wolke"'
      });
    }
    
    const result = await postgresDocumentService.setUserDocumentMode(req.user.id, mode);
    res.json({ success: true, ...result });
  } catch (error) {
    log.error('[Documents /mode] Error setting document mode:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to set document mode'
    });
  }
});

// =============================================================================
// MANUAL MODE ENDPOINTS (Vector-only storage)
// =============================================================================

// Manual upload (no file storage, vectors only)
router.post('/upload-manual', ensureAuthenticated, upload.single('document'), async (req, res) => {
  try {
    const { title } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    // Use document processing service
    const result = await documentProcessingService.processFileUpload(req.user.id, file, title, 'manual');

    res.json({
      success: true,
      message: 'Document processed and vectorized successfully',
      data: result
    });

  } catch (error) {
    log.error('[Documents /upload-manual] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process manual upload'
    });
  }
});

// Add text content manually (no file upload)
router.post('/add-text', ensureAuthenticated, async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Text content is required'
      });
    }

    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    // Use document processing service
    const result = await documentProcessingService.processTextContent(req.user.id, title, content, 'manual');

    res.json({
      success: true,
      message: 'Text processed and vectorized successfully',
      data: result
    });

  } catch (error) {
    log.error('[Documents /add-text] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process text'
    });
  }
});

// =============================================================================
// WOLKE MODE ENDPOINTS
// =============================================================================

// Get user's sync status
router.get('/wolke/sync-status', ensureAuthenticated, async (req, res) => {
  try {
    const syncStatuses = await wolkeSyncService.getUserSyncStatus(req.user.id);
    res.json({ success: true, syncStatuses });
  } catch (error) {
    log.error('[Documents /wolke/sync-status] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get sync status'
    });
  }
});

// Start folder sync
router.post('/wolke/sync', ensureAuthenticated, async (req, res) => {
  try {
    const { shareLinkId, folderPath = '' } = req.body;
    
    if (!shareLinkId) {
      return res.status(400).json({
        success: false,
        message: 'Share link ID is required'
      });
    }
    
    // Start sync in background
    wolkeSyncService.syncFolder(req.user.id, shareLinkId, folderPath)
      .then(result => {
        log.debug(`[Documents /wolke/sync] Sync completed:`, result);
      })
      .catch(error => {
        log.error(`[Documents /wolke/sync] Sync failed:`, error);
      });
    
    res.json({ 
      success: true, 
      message: 'Folder sync started',
      shareLinkId,
      folderPath
    });
  } catch (error) {
    log.error('[Documents /wolke/sync] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start folder sync'
    });
  }
});

// Set auto-sync for a folder
router.post('/wolke/auto-sync', ensureAuthenticated, async (req, res) => {
  try {
    const { shareLinkId, folderPath = '', enabled } = req.body;
    
    if (!shareLinkId || typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Share link ID and enabled flag are required'
      });
    }
    
    const result = await wolkeSyncService.setAutoSync(req.user.id, shareLinkId, folderPath, enabled);
    res.json({ success: true, ...result });
  } catch (error) {
    log.error('[Documents /wolke/auto-sync] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to set auto-sync'
    });
  }
});

// Get user's document mode
router.get('/mode', ensureAuthenticated, async (req, res) => {
  try {
    const documentService = getPostgresDocumentService();
    const mode = await documentService.getUserDocumentMode(req.user.id);
    
    res.json({
      success: true,
      mode: mode
    });
  } catch (error) {
    log.error('[Documents /mode GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Set user's document mode
router.post('/mode', ensureAuthenticated, async (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!mode || !['manual', 'wolke'].includes(mode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mode. Must be "manual" or "wolke"'
      });
    }
    
    const documentService = getPostgresDocumentService();
    const result = await documentService.setUserDocumentMode(req.user.id, mode);
    
    res.json({
      success: true,
      mode: result.mode
    });
  } catch (error) {
    log.error('[Documents /mode POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get documents by source type
router.get('/by-source/{:sourceType}', ensureAuthenticated, async (req, res) => {
  try {
    const { sourceType } = req.params;
    
    if (sourceType && !['manual', 'wolke'].includes(sourceType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid source type. Must be "manual" or "wolke"'
      });
    }
    
    const documents = await postgresDocumentService.getDocumentsBySourceType(req.user.id, sourceType);
    const enriched = documents.map((doc) => {
      let meta = {};
      try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch (e) { meta = {}; }
      const preview = meta.content_preview || (meta.full_text ? generateContentPreview(meta.full_text) : null);
      return preview ? { ...doc, content_preview: preview } : doc;
    });
    res.json({ 
      success: true, 
      data: enriched,
      sourceType,
      count: enriched.length
    });
  } catch (error) {
    log.error('[Documents /by-source] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get documents by source type'
    });
  }
});

// Get document statistics
router.get('/stats', ensureAuthenticated, async (req, res) => {
  try {
    const stats = await postgresDocumentService.getDocumentStats(req.user.id);
    res.json({ success: true, stats });
  } catch (error) {
    log.error('[Documents /stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get document statistics'
    });
  }
});



// Get user documents
router.get('/user', ensureAuthenticated, async (req, res) => {
  try {
    // Get user's document mode preference (defaults to manual)
    const userMode = await postgresDocumentService.getUserDocumentMode(req.user.id);
    
    // Use PostgreSQL + Qdrant exclusively (no more Supabase fallback)
    const documents = await postgresDocumentService.getDocumentsBySourceType(req.user.id, null);

    // Get first chunks from Qdrant for documents that need previews
    const documentIds = documents.map(doc => doc.id);
    const firstChunksResult = await qdrantDocumentService.getDocumentFirstChunks(req.user.id, documentIds);
    const firstChunks = firstChunksResult.chunks || {};

    // Enrich with all content fields for frontend access
    const enrichedDocs = documents.map((doc) => {
      let meta = {};
      try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch (e) { meta = {}; }

      // Generate content_preview from metadata, full_text, or Qdrant first chunk
      const preview = meta.content_preview ||
                     (meta.full_text ? generateContentPreview(meta.full_text) : null) ||
                     (firstChunks[doc.id] ? generateContentPreview(firstChunks[doc.id]) : null);

      // Include all content fields for optimal preview rendering
      return {
        ...doc,
        content_preview: preview,
        // Ensure markdown_content, ocr_text, and full_content are available for preview
        full_content: meta.full_text || doc.full_content || null,
      };
    });
    
    // Sort documents by created_at
    enrichedDocs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
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
    log.error('[Documents /user] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents'
    });
  }
});

// Get combined user content (documents + texts) for improved performance
router.get('/combined-content', ensureAuthenticated, async (req, res) => {
  try {
    log.debug(`[Documents /combined-content] Fetching combined content for user: ${req.user.id}`);

    // Fetch documents and texts in parallel for better performance
    const [documents, texts] = await Promise.all([
      postgresDocumentService.getDocumentsBySourceType(req.user.id, null),
      postgresDocumentService.getUserTexts(req.user.id)
    ]);

    // Get first chunks from Qdrant for documents that need previews
    const documentIds = documents.map(doc => doc.id);
    const firstChunksResult = await qdrantDocumentService.getDocumentFirstChunks(req.user.id, documentIds);
    const firstChunks = firstChunksResult.chunks || {};

    // Enrich documents with all content fields for frontend access
    const enrichedDocs = documents.map((doc) => {
      let meta = {};
      try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch (e) { meta = {}; }

      // Generate content_preview from metadata, full_text, or Qdrant first chunk
      const preview = meta.content_preview ||
                     (meta.full_text ? generateContentPreview(meta.full_text) : null) ||
                     (firstChunks[doc.id] ? generateContentPreview(firstChunks[doc.id]) : null);

      // Include all content fields for optimal preview rendering
      return {
        ...doc,
        content_preview: preview,
        // Ensure markdown_content, ocr_text, and full_content are available for preview
        full_content: meta.full_text || doc.full_content || null,
      };
    });

    // Sort both documents and texts by created_at
    enrichedDocs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    texts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    log.debug(`[Documents /combined-content] Returning ${enrichedDocs.length} documents and ${texts.length} texts`);

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
    log.error('[Documents /combined-content] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch combined content'
    });
  }
});


// Bulk delete documents (PostgreSQL + Qdrant only)
router.delete('/bulk', ensureAuthenticated, async (req, res) => {
  log.debug('[Documents] BULK DELETE ROUTE HIT - Route is accessible');
  log.debug('[Documents] Request method:', req.method);
  log.debug('[Documents] Request URL:', req.originalUrl);
  log.debug('[Documents] User authenticated:', !!req.user);
  log.debug('[Documents] User ID:', req.user?.id);
  log.debug('[Documents] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { ids } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of document IDs is required'
      });
    }

    log.debug(`[Documents] Bulk delete request for ${ids.length} documents from user ${req.user.id}`);
    log.debug('[Documents] Document IDs to delete:', ids);

    // Delete document metadata from PostgreSQL
    log.debug('[Documents] Starting bulk delete operation...');
    const deleteResult = await postgresDocumentService.bulkDeleteDocuments(ids, req.user.id);

    // Delete document vectors from Qdrant
    const vectorDeletePromises = deleteResult.deletedIds.map(async (documentId) => {
      try {
        await qdrantDocumentService.deleteDocumentVectors(documentId, req.user.id);
        return { documentId, success: true };
      } catch (error) {
        log.warn(`[Documents] Failed to delete vectors for document ${documentId}:`, error);
        return { documentId, success: false, error: error.message };
      }
    });

    const vectorDeleteResults = await Promise.allSettled(vectorDeletePromises);
    const vectorDeleteSuccesses = vectorDeleteResults.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    log.debug(`[Documents] Bulk delete completed: ${deleteResult.deletedCount} documents deleted, ${vectorDeleteSuccesses} vector collections deleted`);

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
    log.error('[Documents] Error in bulk delete:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to perform bulk delete'
    });
  }
});

// Delete document (PostgreSQL + Qdrant only)
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Delete document metadata from PostgreSQL (includes ownership check)
    await postgresDocumentService.deleteDocument(id, req.user.id);

    // Delete document vectors from Qdrant
    try {
      await qdrantDocumentService.deleteDocumentVectors(id, req.user.id);
      log.debug(`[Documents /delete] Successfully deleted vectors for document ${id}`);
    } catch (vectorError) {
      log.warn('[Documents /delete] Vector deletion warning:', vectorError);
      // Continue even if vector deletion fails - document metadata is already deleted
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    log.error('[Documents /delete] Error:', error);
    
    if (error.message.includes('not found') || error.message.includes('access denied')) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document'
    });
  }
});

// Search documents (Qdrant vector search only)
router.post('/search', ensureAuthenticated, async (req, res) => {
  try {
    const { query, limit = 5, searchMode = 'hybrid', documentIds } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    log.debug(`[Documents /search] Search request: "${query}" (user: ${req.user.id}, mode: ${searchMode})`);

    let searchResult;

    // Choose search method based on mode
    if (searchMode === 'hybrid') {
      // Use hybrid search for best results
      searchResult = await documentSearchService.hybridSearch(
        query.trim(), 
        req.user.id, 
        { 
          limit: Math.min(Math.max(1, limit), 20),
          vectorWeight: 0.7,
          textWeight: 0.3,
          documentIds: Array.isArray(documentIds) && documentIds.length ? documentIds : undefined
        }
      );
    } else if (searchMode === 'text') {
      // Full-text only search
      searchResult = await documentSearchService.textSearch(
        query.trim(),
        req.user.id,
        {
          limit: Math.min(Math.max(1, limit), 20),
          documentIds: Array.isArray(documentIds) && documentIds.length ? documentIds : undefined
        }
      );
    } else {
      // Fallback to hybrid for unknown modes
      searchResult = await documentSearchService.hybridSearch(
        query.trim(),
        req.user.id,
        {
          limit: Math.min(Math.max(1, limit), 20),
          vectorWeight: 0.7,
          textWeight: 0.3,
          documentIds: Array.isArray(documentIds) && documentIds.length ? documentIds : undefined
        }
      );
    }

    // Guard against validation errors returning no results array
    const safeResults = Array.isArray(searchResult?.results) ? searchResult.results : [];

    // Transform results for backward compatibility
    const compatibleResults = safeResults.map(doc => ({
      id: doc.document_id,
      title: doc.title,
      filename: doc.filename,
      relevantText: doc.relevant_content,
      created_at: doc.created_at,
      similarity_score: doc.similarity_score,
      relevance_info: doc.relevance_info,
      search_type: searchResult.searchType
    }));

    // If validation error occurred, return a safe response with empty data
    if (!searchResult?.success && !Array.isArray(searchResult?.results)) {
      return res.status(400).json({
        success: false,
        data: [],
        message: searchResult?.message || 'Validation error',
        searchType: searchResult?.searchType || 'error',
        query: query.trim()
      });
    }

    res.json({
      success: searchResult.success,
      data: compatibleResults,
      message: searchResult.message,
      searchType: searchResult.searchType,
      query: searchResult.query
    });

  } catch (error) {
    log.error('[Documents /search] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to search documents'
    });
  }
});

// Get document content (PostgreSQL + Qdrant only)
router.get('/:id/content', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Get document metadata from PostgreSQL
    const document = await postgresDocumentService.getDocumentById(id, req.user.id);
    
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }

    // Get text content from Qdrant vectors
    let ocrText = '';
    try {
      log.debug(`[Documents /content] Fetching text from Qdrant for document ${id}`);
      const qdrantResult = await qdrantDocumentService.getDocumentFullText(req.user.id, id);
      if (qdrantResult.success && qdrantResult.fullText) {
        ocrText = qdrantResult.fullText;
        log.debug(`[Documents /content] Successfully retrieved ${qdrantResult.chunkCount} chunks from Qdrant for document ${id}`);
      } else {
        log.warn(`[Documents /content] No text found in Qdrant for document ${id}`);
      }
    } catch (qdrantError) {
      log.error(`[Documents /content] Error retrieving text from Qdrant for document ${id}:`, qdrantError);
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
    log.error('[Documents /content] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get document content'
    });
  }
});

// Get search performance stats (PostgreSQL + Qdrant only)
router.get('/search/stats', ensureAuthenticated, async (req, res) => {
  try {
    // Get user document stats from PostgreSQL
    const docStats = await postgresDocumentService.getDocumentStats(req.user.id);
    
    // Get vector stats from Qdrant
    const vectorStats = await qdrantDocumentService.getUserVectorStats(req.user.id);

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
          qdrant_vector_search: true
        }
      }
    });

  } catch (error) {
    log.error('[Documents /search/stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get search stats'
    });
  }
});


// Test hybrid search endpoint
router.post('/search/hybrid-test', ensureAuthenticated, async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    log.debug(`[Documents /search/hybrid-test] Testing hybrid search: "${query}"`);

    // Run both search methods for comparison
    const [vectorResult, hybridResult] = await Promise.all([
      documentSearchService.searchDocuments(query.trim(), req.user.id, { limit }),
      documentSearchService.hybridSearch(query.trim(), req.user.id, { limit })
    ]);

    res.json({
      success: true,
      data: {
        query: query.trim(),
        vector_search: {
          results: vectorResult.results,
          search_type: vectorResult.searchType,
          message: vectorResult.message
        },
        hybrid_search: {
          results: hybridResult.results,
          search_type: hybridResult.searchType,
          message: hybridResult.message,
          stats: hybridResult.stats
        }
      }
    });

  } catch (error) {
    log.error('[Documents /search/hybrid-test] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to test hybrid search'
    });
  }
});

/**
 * POST /api/documents/search-content
 * Search for relevant content within specific documents using vector search
 * This endpoint is used for intelligent document content extraction in forms
 * Uses PostgreSQL + Qdrant only
 */
router.post('/search-content', ensureAuthenticated, async (req, res) => {
    try {
        const { query, documentIds, limit = 5, mode = 'hybrid' } = req.body;

        // Validate input
        if (!query || !query.trim()) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
            return res.status(400).json({ error: 'Document IDs array is required' });
        }

        // Use document content service
        const result = await documentContentService.searchDocumentContent(req.user.id, {
            query,
            documentIds,
            limit,
            mode
        });

        res.json(result);

    } catch (error) {
        log.error('[Documents API] Error in POST /search-content:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});


// Manual URL crawling (vectors-only)
router.post('/crawl-url-manual', ensureAuthenticated, async (req, res) => {
  try {
    const { url, title } = req.body;

    if (!url || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: 'URL is required'
      });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    log.debug(`[Documents /crawl-url-manual] Starting crawl for URL: ${url} with title: ${title}`);

    // Import URL crawler
    const { urlCrawlerService } = await import('../services/urlCrawlerService.js');

    // Crawl the URL
    const crawlResult = await urlCrawlerService.crawlUrl(url.trim());
    if (!crawlResult.success || !crawlResult.data?.content) {
      throw new Error(crawlResult.error || 'Failed to crawl URL');
    }

    // Use document processing service
    const result = await documentProcessingService.processUrlContent(
      req.user.id,
      url,
      title,
      crawlResult.data.content,
      'url'
    );

    res.json({
      success: true,
      message: 'URL crawled and vectorized successfully',
      data: result
    });

  } catch (error) {
    log.error('[Documents /crawl-url-manual] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =============================================================================
// DEFAULT MODE ROUTING - Automatically use manual mode for new uploads
// =============================================================================

// Default upload endpoint - redirects to manual mode for new uploads
router.post('/upload-default', ensureAuthenticated, upload.single('document'), async (req, res) => {
  log.debug('[Documents /upload-default] Redirecting to manual mode for new upload');
  
  // Check user's document mode preference
  try {
    const userMode = await postgresDocumentService.getUserDocumentMode(req.user.id);
    log.debug(`[Documents /upload-default] User mode: ${userMode}`);
    
    if (userMode === 'manual' || userMode === 'wolke') {
      // Forward to manual upload endpoint
      req.url = '/upload-manual';
      return router.handle(req, res);
    } else {
      // Fallback to legacy upload for users not migrated yet
      req.url = '/upload';
      return router.handle(req, res);
    }
  } catch (error) {
    log.error('[Documents /upload-default] Error checking user mode, defaulting to manual:', error);
    // Default to manual mode if there's an error
    req.url = '/upload-manual';
    return router.handle(req, res);
  }
});

// Default URL crawling endpoint - redirects to manual mode
router.post('/crawl-url-default', ensureAuthenticated, async (req, res) => {
  log.debug('[Documents /crawl-url-default] Redirecting to manual mode for URL crawling');
  
  try {
    const userMode = await postgresDocumentService.getUserDocumentMode(req.user.id);
    log.debug(`[Documents /crawl-url-default] User mode: ${userMode}`);
    
    if (userMode === 'manual' || userMode === 'wolke') {
      // Forward to manual crawl endpoint
      req.url = '/crawl-url-manual';
      return router.handle(req, res);
    } else {
      // Fallback to legacy crawl for users not migrated yet
      req.url = '/crawl-url';
      return router.handle(req, res);
    }
  } catch (error) {
    log.error('[Documents /crawl-url-default] Error checking user mode, defaulting to manual:', error);
    // Default to manual mode if there's an error
    req.url = '/crawl-url-manual';
    return router.handle(req, res);
  }
});

// =============================================================================
// QDRANT DOCUMENT RETRIEVAL ENDPOINTS
// =============================================================================

// Get document full text from Qdrant chunks
router.get('/:documentId/full-text', ensureAuthenticated, async (req, res) => {
  try {
    const { documentId } = req.params;
    
    log.debug(`[Documents /:documentId/full-text] Retrieving full text for document: ${documentId}`);
    
    // First verify the document belongs to the user (from PostgreSQL metadata)
    const documentMeta = await postgresDocumentService.getDocumentById(documentId, req.user.id);
    
    if (!documentMeta) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }
    
    // Get full text from Qdrant
    const result = await qdrantDocumentService.getDocumentFullText(req.user.id, documentId);
    
    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error || 'Document text not found'
      });
    }
    
    log.debug(`[Documents /:documentId/full-text] Retrieved text with ${result.chunkCount} chunks`);
    
    res.json({
      success: true,
      data: {
        id: documentId,
        fullText: result.fullText,
        chunkCount: result.chunkCount,
        metadata: {
          ...result.metadata,
          // Merge with PostgreSQL metadata
          ...documentMeta
        }
      }
    });
  } catch (error) {
    log.error(`[Documents /:documentId/full-text] Error:`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve document text'
    });
  }
});

// Get multiple documents with full text (bulk retrieval)
router.post('/bulk/full-text', ensureAuthenticated, async (req, res) => {
  try {
    const { documentIds } = req.body;
    
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'documentIds array is required'
      });
    }
    
    log.debug(`[Documents /bulk/full-text] Retrieving full text for ${documentIds.length} documents`);
    
    // Verify all documents belong to the user
    const documentsMetadata = await Promise.all(
      documentIds.map(docId => postgresDocumentService.getDocumentById(docId, req.user.id))
    );
    
    // Filter out null results (documents not found or access denied)
    const validDocumentIds = documentsMetadata
      .map((meta, index) => meta ? documentIds[index] : null)
      .filter(Boolean);
    
    if (validDocumentIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No accessible documents found'
      });
    }
    
    // Get full text for valid documents from Qdrant
    const result = await qdrantDocumentService.getMultipleDocumentsFullText(req.user.id, validDocumentIds);
    
    log.debug(`[Documents /bulk/full-text] Retrieved ${result.documents.length} documents, ${result.errors.length} errors`);
    
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
    log.error('[Documents /bulk/full-text] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve documents text'
    });
  }
});

// Get documents list from Qdrant (alternative to PostgreSQL-based listing)
router.get('/qdrant/list', ensureAuthenticated, async (req, res) => {
  try {
    const { sourceType, limit } = req.query;
    
    log.debug(`[Documents /qdrant/list] Retrieving documents list from Qdrant for user: ${req.user.id}`);
    
    const result = await qdrantDocumentService.getUserDocumentsList(req.user.id, {
      sourceType: sourceType || null,
      limit: limit ? parseInt(limit) : 1000
    });
    
    if (!result.success) {
      throw new Error('Failed to retrieve documents from Qdrant');
    }
    
    log.debug(`[Documents /qdrant/list] Retrieved ${result.documents.length} documents from Qdrant`);
    
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
    log.error('[Documents /qdrant/list] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve documents from Qdrant'
    });
  }
});

// Get Qdrant vector statistics for user
router.get('/qdrant/stats', ensureAuthenticated, async (req, res) => {
  try {
    log.debug(`[Documents /qdrant/stats] Getting vector stats for user: ${req.user.id}`);
    
    const stats = await qdrantDocumentService.getUserVectorStats(req.user.id);
    
    log.debug(`[Documents /qdrant/stats] User has ${stats.totalVectors} vectors across ${stats.uniqueDocuments} documents`);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    log.error('[Documents /qdrant/stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get vector statistics'
    });
  }
});

// Browse files in a Wolke share without syncing
router.get('/wolke/browse/:shareLinkId', ensureAuthenticated, async (req, res) => {
  try {
    const { shareLinkId } = req.params;

    if (!shareLinkId) {
      return res.status(400).json({
        success: false,
        message: 'Share link ID is required'
      });
    }

    log.debug(`[Documents /wolke/browse] Browsing files for share link ${shareLinkId}`);

    // Get the share link
    const shareLink = await wolkeSyncService.getShareLink(req.user.id, shareLinkId);

    // List files in the folder
    const files = await wolkeSyncService.listFolderContents(shareLink);

    // Filter and enrich files with additional metadata for UI
    const enrichedFiles = files.map(file => ({
      ...file,
      fileExtension: path.extname(file.name).toLowerCase(),
      isSupported: wolkeSyncService.supportedFileTypes.includes(path.extname(file.name).toLowerCase()),
      sizeFormatted: file.size ? formatFileSize(file.size) : 'Unknown',
      lastModifiedFormatted: file.lastModified ? file.lastModified.toLocaleDateString('de-DE') : 'Unknown'
    }));

    res.json({
      success: true,
      shareLink: {
        id: shareLink.id,
        label: shareLink.label,
        baseUrl: shareLink.base_url
      },
      files: enrichedFiles,
      totalFiles: enrichedFiles.length,
      supportedFiles: enrichedFiles.filter(f => f.isSupported).length
    });

  } catch (error) {
    log.error('[Documents /wolke/browse] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to browse Wolke files'
    });
  }
});

// Import selected files from Wolke
router.post('/wolke/import', ensureAuthenticated, async (req, res) => {
  try {
    const { shareLinkId, files } = req.body;

    if (!shareLinkId || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Share link ID and files array are required'
      });
    }

    log.debug(`[Documents /wolke/import] Importing ${files.length} files from share link ${shareLinkId}`);

    // Get the share link
    const shareLink = await wolkeSyncService.getShareLink(req.user.id, shareLinkId);

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    // Process each selected file
    for (const fileInfo of files) {
      try {
        log.debug(`[Documents /wolke/import] Processing file: ${fileInfo.name}`);

        // Check if file already exists to prevent duplicates
        const existingDoc = await postgresDocumentService.getDocumentByWolkeFile(
          req.user.id,
          shareLinkId,
          fileInfo.href
        );

        if (existingDoc) {
          log.debug(`[Documents /wolke/import] File already imported: ${fileInfo.name}`);
          results.push({
            filename: fileInfo.name,
            success: false,
            skipped: true,
            reason: 'already_imported',
            documentId: existingDoc.id
          });
          continue;
        }

        // Use the wolke sync service to process the file
        const result = await wolkeSyncService.processFile(req.user.id, shareLinkId, fileInfo, shareLink);

        if (result.success) {
          successCount++;
          results.push({
            filename: fileInfo.name,
            success: true,
            documentId: result.documentId,
            vectorsCreated: result.vectorsCreated
          });
        } else if (result.skipped) {
          results.push({
            filename: fileInfo.name,
            success: false,
            skipped: true,
            reason: result.reason
          });
        }

      } catch (error) {
        failedCount++;
        log.error(`[Documents /wolke/import] Failed to process file ${fileInfo.name}:`, error);
        results.push({
          filename: fileInfo.name,
          success: false,
          error: error.message
        });
      }
    }

    log.debug(`[Documents /wolke/import] Import completed: ${successCount} successful, ${failedCount} failed`);

    res.json({
      success: true,
      message: `Import completed: ${successCount} of ${files.length} files imported successfully`,
      results,
      summary: {
        total: files.length,
        successful: successCount,
        failed: failedCount,
        skipped: results.filter(r => r.skipped).length
      }
    });

  } catch (error) {
    log.error('[Documents /wolke/import] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to import Wolke files'
    });
  }
});

// Helper function to format file sizes
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
