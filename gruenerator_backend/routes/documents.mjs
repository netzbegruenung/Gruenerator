import express from 'express';
import multer from 'multer';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { DocumentSearchService } from '../services/DocumentSearchService.js';
import { fastEmbedService } from '../services/FastEmbedService.js';
import { urlCrawlerService } from '../services/urlCrawlerService.js';
import { getPostgresDocumentService } from '../services/postgresDocumentService.js';
import { getWolkeSyncService } from '../services/wolkeSyncService.js';
import { smartChunkDocument } from '../utils/textChunker.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ocrService } from '../services/ocrService.js';
import passport from '../config/passportSetup.mjs';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Initialize services
const postgresDocumentService = getPostgresDocumentService();
const documentSearchService = new DocumentSearchService();
const qdrantDocumentService = documentSearchService; // Backward compatibility
const wolkeSyncService = getWolkeSyncService();

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
  console.log(`[Documents] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
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
    console.error('[Documents /mode] Error getting document mode:', error);
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
    console.error('[Documents /mode] Error setting document mode:', error);
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

    console.log(`[Documents /upload-manual] Processing manual upload: ${title}`);

    // Extract text from file buffer (in memory)
    let extractedText;
    try {
      if (file.mimetype === 'application/pdf') {
        // Create temporary file for OCR processing
        const tempDir = os.tmpdir();
        const tempFileName = `manual_upload_${Date.now()}_${file.originalname}`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        await fs.writeFile(tempFilePath, file.buffer);
        const ocrResult = await ocrService.extractTextFromPDF(tempFilePath);
        extractedText = ocrResult.text;
        
        // Clean up temp file
        await fs.unlink(tempFilePath);
      } else {
        // For text files, convert buffer to string
        extractedText = file.buffer.toString('utf-8');
      }
    } catch (ocrError) {
      console.error('[Documents /upload-manual] OCR error:', ocrError);
      throw new Error('Failed to extract text from document');
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No text could be extracted from the document'
      });
    }

    // Chunk the extracted text
    const chunks = smartChunkDocument(extractedText, {
      maxTokens: 400,
      overlapTokens: 50,
      preserveStructure: true
    });

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Document could not be processed into chunks'
      });
    }

    // Generate embeddings
    const texts = chunks.map(chunk => chunk.text);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(texts, 'search_document');

    // Save document metadata (no file storage)
    const documentMetadata = await postgresDocumentService.saveDocumentMetadata(req.user.id, {
      title: title.trim(),
      filename: file.originalname,
      sourceType: 'manual',
      vectorCount: chunks.length,
      fileSize: file.size,
      status: 'completed',
      additionalMetadata: {
        content_preview: generateContentPreview(extractedText)
      }
    });

    // Store vectors in Qdrant only
    await qdrantDocumentService.storeDocumentVectors(
      req.user.id,
      documentMetadata.id,
      chunks,
      embeddings,
      {
        sourceType: 'manual',
        title: title.trim(),
        filename: file.originalname
      }
    );

    console.log(`[Documents /upload-manual] Successfully processed: ${title} (${chunks.length} vectors)`);

    res.json({
      success: true,
      message: 'Document processed and vectorized successfully',
      data: {
        id: documentMetadata.id,
        title: documentMetadata.title,
        vectorCount: chunks.length,
        sourceType: 'manual'
      }
    });

  } catch (error) {
    console.error('[Documents /upload-manual] Error:', error);
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

    console.log(`[Documents /add-text] Processing manual text: ${title} (${content.length} chars)`);

    // Chunk the text content
    const chunks = smartChunkDocument(content.trim(), {
      maxTokens: 400,
      overlapTokens: 50,
      preserveStructure: true
    });

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Text could not be processed into chunks'
      });
    }

    // Generate embeddings
    const texts = chunks.map(chunk => chunk.text);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(texts, 'search_document');

    // Save document metadata (no file storage)
    const documentMetadata = await postgresDocumentService.saveDocumentMetadata(req.user.id, {
      title: title.trim(),
      filename: 'manual_text_input.txt',
      sourceType: 'manual',
      vectorCount: chunks.length,
      fileSize: content.length,
      status: 'completed',
      additionalMetadata: {
        content_preview: generateContentPreview(content)
      }
    });

    // Store vectors in Qdrant
    await qdrantDocumentService.storeDocumentVectors(
      req.user.id,
      documentMetadata.id,
      chunks,
      embeddings,
      {
        sourceType: 'manual',
        title: title.trim(),
        filename: 'manual_text_input.txt'
      }
    );

    console.log(`[Documents /add-text] Successfully processed: ${title} (${chunks.length} vectors)`);

    res.json({
      success: true,
      message: 'Text processed and vectorized successfully',
      data: {
        id: documentMetadata.id,
        title: documentMetadata.title,
        vectorCount: chunks.length,
        sourceType: 'manual'
      }
    });

  } catch (error) {
    console.error('[Documents /add-text] Error:', error);
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
    console.error('[Documents /wolke/sync-status] Error:', error);
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
        console.log(`[Documents /wolke/sync] Sync completed:`, result);
      })
      .catch(error => {
        console.error(`[Documents /wolke/sync] Sync failed:`, error);
      });
    
    res.json({ 
      success: true, 
      message: 'Folder sync started',
      shareLinkId,
      folderPath
    });
  } catch (error) {
    console.error('[Documents /wolke/sync] Error:', error);
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
    console.error('[Documents /wolke/auto-sync] Error:', error);
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
    console.error('[Documents /mode GET] Error:', error);
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
    console.error('[Documents /mode POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get documents by source type
router.get('/by-source/:sourceType?', ensureAuthenticated, async (req, res) => {
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
    console.error('[Documents /by-source] Error:', error);
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
    console.error('[Documents /stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get document statistics'
    });
  }
});



// Get user documents
router.get('/user', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[Documents /user] Request received for user:', req.user?.id);
    
    // Get user's document mode preference (defaults to manual)
    const userMode = await postgresDocumentService.getUserDocumentMode(req.user.id);
    console.log(`[Documents /user] User mode: ${userMode}`);
    
    // Use PostgreSQL + Qdrant exclusively (no more Supabase fallback)
    const documents = await postgresDocumentService.getDocumentsBySourceType(req.user.id, null);

    // Enrich with content_preview from metadata for consistent frontend access
    const enrichedDocs = documents.map((doc) => {
      let meta = {};
      try { meta = doc.metadata ? JSON.parse(doc.metadata) : {}; } catch (e) { meta = {}; }
      const preview = meta.content_preview || (meta.full_text ? generateContentPreview(meta.full_text) : null);
      return preview ? { ...doc, content_preview: preview } : doc;
    });
    
    // Sort documents by created_at
    enrichedDocs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    console.log(`[Documents /user] Found ${enrichedDocs.length} documents from PostgreSQL`);
    
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
    console.error('[Documents /user] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents'
    });
  }
});


// Bulk delete documents (PostgreSQL + Qdrant only)
router.delete('/bulk', ensureAuthenticated, async (req, res) => {
  console.log('[Documents] BULK DELETE ROUTE HIT - Route is accessible');
  console.log('[Documents] Request method:', req.method);
  console.log('[Documents] Request URL:', req.originalUrl);
  console.log('[Documents] User authenticated:', !!req.user);
  console.log('[Documents] User ID:', req.user?.id);
  console.log('[Documents] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { ids } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of document IDs is required'
      });
    }

    console.log(`[Documents] Bulk delete request for ${ids.length} documents from user ${req.user.id}`);
    console.log('[Documents] Document IDs to delete:', ids);

    // Delete document metadata from PostgreSQL
    console.log('[Documents] Starting bulk delete operation...');
    const deleteResult = await postgresDocumentService.bulkDeleteDocuments(ids, req.user.id);

    // Delete document vectors from Qdrant
    const vectorDeletePromises = deleteResult.deletedIds.map(async (documentId) => {
      try {
        await qdrantDocumentService.deleteDocumentVectors(documentId, req.user.id);
        return { documentId, success: true };
      } catch (error) {
        console.warn(`[Documents] Failed to delete vectors for document ${documentId}:`, error);
        return { documentId, success: false, error: error.message };
      }
    });

    const vectorDeleteResults = await Promise.allSettled(vectorDeletePromises);
    const vectorDeleteSuccesses = vectorDeleteResults.filter(result => 
      result.status === 'fulfilled' && result.value.success
    ).length;

    console.log(`[Documents] Bulk delete completed: ${deleteResult.deletedCount} documents deleted, ${vectorDeleteSuccesses} vector collections deleted`);

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
    console.error('[Documents] Error in bulk delete:', error);
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
      console.log(`[Documents /delete] Successfully deleted vectors for document ${id}`);
    } catch (vectorError) {
      console.warn('[Documents /delete] Vector deletion warning:', vectorError);
      // Continue even if vector deletion fails - document metadata is already deleted
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('[Documents /delete] Error:', error);
    
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

    console.log(`[Documents /search] Search request: "${query}" (user: ${req.user.id}, mode: ${searchMode})`);

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
    console.error('[Documents /search] Error:', error);
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
      console.log(`[Documents /content] Fetching text from Qdrant for document ${id}`);
      const qdrantResult = await qdrantDocumentService.getDocumentFullText(req.user.id, id);
      if (qdrantResult.success && qdrantResult.fullText) {
        ocrText = qdrantResult.fullText;
        console.log(`[Documents /content] Successfully retrieved ${qdrantResult.chunkCount} chunks from Qdrant for document ${id}`);
      } else {
        console.warn(`[Documents /content] No text found in Qdrant for document ${id}`);
      }
    } catch (qdrantError) {
      console.error(`[Documents /content] Error retrieving text from Qdrant for document ${id}:`, qdrantError);
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
    console.error('[Documents /content] Error:', error);
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
    console.error('[Documents /search/stats] Error:', error);
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

    console.log(`[Documents /search/hybrid-test] Testing hybrid search: "${query}"`);

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
    console.error('[Documents /search/hybrid-test] Error:', error);
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
    const startTime = Date.now();
    
    try {
        const userId = req.user.id;
        const { query, documentIds, limit = 5, mode = 'hybrid' } = req.body;

        // Validate input
        if (!query || !query.trim()) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
            return res.status(400).json({ error: 'Document IDs array is required' });
        }

        const trimmedQuery = query.trim();

        console.log(`[Documents API] Content search request: query="${trimmedQuery}", documentIds=[${documentIds.length} docs], user=${userId}`);

        // Verify user owns the requested documents using PostgreSQL
        const accessibleDocuments = [];
        for (const docId of documentIds) {
            try {
                const doc = await postgresDocumentService.getDocumentById(docId, userId);
                if (doc) {
                    accessibleDocuments.push(doc);
                }
            } catch (error) {
                console.warn(`[Documents API] Document ${docId} not accessible:`, error.message);
            }
        }

        if (accessibleDocuments.length === 0) {
            return res.status(404).json({ error: 'No accessible documents found' });
        }

        const accessibleDocumentIds = accessibleDocuments.map(doc => doc.id);

        // Perform vector search with document filtering
        let searchResults = [];
        try {
            const searchResponse = await documentSearchService.search({
                query: trimmedQuery,
                user_id: userId,
                documentIds: accessibleDocumentIds,
                limit: limit * 2, // Get more results for better content selection
                mode: mode
            });
            searchResults = searchResponse.results || [];
            
            console.log(`[Documents API] Vector search found ${searchResults.length} results`);
        } catch (searchError) {
            console.error('[Documents API] Vector search error:', searchError);
            searchResults = [];
        }

        // Process results and create intelligent content extracts
        const documentContents = new Map();
        
        if (searchResults.length > 0) {
            // Use vector search results to create intelligent content
            searchResults.forEach(result => {
                const docId = result.document_id;
                const content = result.relevant_content || result.chunk_text || '';
                
                if (!documentContents.has(docId)) {
                    const docInfo = accessibleDocuments.find(d => d.id === docId);
                    
                    documentContents.set(docId, {
                        document_id: docId,
                        title: docInfo?.title || result.title || 'Untitled',
                        filename: docInfo?.filename || result.filename || null,
                        vector_count: docInfo?.vector_count || 0,
                        content_type: 'vector_search',
                        content: content,
                        similarity_score: result.similarity_score,
                        search_info: result.relevance_info || 'Vector search found relevant content'
                    });
                } else {
                    // Append additional content if we have more chunks from the same document
                    const existing = documentContents.get(docId);
                    existing.content += '\n\n---\n\n' + content;
                    // Keep the higher similarity score
                    if (result.similarity_score > existing.similarity_score) {
                        existing.similarity_score = result.similarity_score;
                    }
                }
            });
        }
        
        // For documents not found in vector search, get full text from Qdrant
        for (const doc of accessibleDocuments) {
            if (!documentContents.has(doc.id)) {
                try {
                    const qdrantResult = await qdrantDocumentService.getDocumentFullText(userId, doc.id);
                    let content = '';
                    let contentType = 'full_text_from_vectors';
                    
                    if (qdrantResult.success && qdrantResult.fullText) {
                        const fullText = qdrantResult.fullText;
                        
                        // Create intelligent excerpt if document is large
                        if (fullText.length > 2000) {
                            content = createIntelligentExcerpt(fullText, trimmedQuery, 1500);
                            contentType = 'intelligent_excerpt_from_vectors';
                        } else {
                            content = fullText;
                        }
                    }
                    
                    documentContents.set(doc.id, {
                        document_id: doc.id,
                        title: doc.title,
                        filename: doc.filename,
                        vector_count: doc.vector_count || 0,
                        content_type: contentType,
                        content: content,
                        similarity_score: null,
                        search_info: contentType === 'full_text_from_vectors' 
                            ? 'Full text retrieved from vectors'
                            : 'Intelligent excerpt created from vectors'
                    });
                } catch (qdrantError) {
                    console.error(`[Documents API] Failed to get full text for document ${doc.id}:`, qdrantError);
                    // Add empty entry to indicate document was processed
                    documentContents.set(doc.id, {
                        document_id: doc.id,
                        title: doc.title,
                        filename: doc.filename,
                        vector_count: doc.vector_count || 0,
                        content_type: 'no_content',
                        content: '',
                        similarity_score: null,
                        search_info: 'No content available'
                    });
                }
            }
        }

        const results = Array.from(documentContents.values());
        const responseTime = Date.now() - startTime;

        console.log(`[Documents API] Returning ${results.length} document contents (${responseTime}ms)`);

        // Count different content types for metadata
        const contentTypeCounts = {};
        results.forEach(result => {
            const type = result.content_type || 'unknown';
            contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
        });

        res.json({
            success: true,
            results: results,
            query: trimmedQuery,
            search_mode: mode,
            metadata: {
                response_time_ms: responseTime,
                documents_processed: results.length,
                vector_search_results: searchResults.length,
                content_type_breakdown: contentTypeCounts,
                processing_version: '3.0_postgres_qdrant',
                user_id: userId
            }
        });

    } catch (error) {
        console.error('[Documents API] Error in POST /search-content:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

/**
 * Determine the best content strategy for a document based on multiple factors
 * @param {Object} doc - Document object with metadata
 * @param {string} query - Search query for context
 * @returns {boolean} True if full content should be used, false for excerpt
 */
function determineContentStrategy(doc, query) {
    const text = doc.ocr_text || '';
    const pageCount = doc.page_count || 0;
    const charCount = text.length;
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;
    
    // Factor 1: Page count (most reliable indicator)
    if (pageCount <= 1) return true; // Single page documents always use full content
    if (pageCount >= 10) return false; // Very long documents always use excerpts
    
    // Factor 2: Character count
    if (charCount <= 1500) return true; // Very short documents
    if (charCount >= 8000) return false; // Very long documents
    
    // Factor 3: Word density (chars per word) - detect scanned documents with OCR errors
    const avgCharsPerWord = wordCount > 0 ? charCount / wordCount : 0;
    if (avgCharsPerWord > 15) return false; // Likely OCR errors, use excerpt to avoid noise
    
    // Factor 4: Query relevance - if query matches document title/filename, more likely to be relevant
    if (query && query.trim()) {
        const queryLower = query.toLowerCase();
        const titleLower = (doc.title || '').toLowerCase();
        const filenameLower = (doc.filename || '').toLowerCase();
        
        if (titleLower.includes(queryLower) || filenameLower.includes(queryLower)) {
            // High relevance - be more generous with full content for smaller docs
            return pageCount <= 3 && charCount <= 4000;
        }
    }
    
    // Factor 5: Default thresholds for medium-size documents
    if (pageCount <= 2 && charCount <= 3000) return true;
    
    // Default to excerpt for everything else
    return false;
}

/**
 * Create an intelligent excerpt from document text based on search query
 * Falls back when vector search is not available
 */
function createIntelligentExcerpt(text, query, maxLength = 1500) {
    if (!text || text.length <= maxLength) {
        return text;
    }

    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // Find all occurrences of query terms
    const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
    const matches = [];
    
    queryTerms.forEach(term => {
        let index = textLower.indexOf(term);
        while (index !== -1) {
            matches.push({ index, term, length: term.length });
            index = textLower.indexOf(term, index + 1);
        }
    });
    
    if (matches.length === 0) {
        // No matches found, return beginning of document
        return text.substring(0, maxLength) + '...';
    }
    
    // Sort matches by position
    matches.sort((a, b) => a.index - b.index);
    
    // Create excerpt around the first significant match
    const firstMatch = matches[0];
    const excerptStart = Math.max(0, firstMatch.index - Math.floor(maxLength / 3));
    const excerptEnd = Math.min(text.length, excerptStart + maxLength);
    
    let excerpt = text.substring(excerptStart, excerptEnd);
    
    // Try to cut at sentence boundaries
    if (excerptStart > 0) {
        const sentenceStart = excerpt.indexOf('. ');
        if (sentenceStart > 0 && sentenceStart < 100) {
            excerpt = excerpt.substring(sentenceStart + 2);
        } else {
            excerpt = '...' + excerpt;
        }
    }
    
    if (excerptEnd < text.length) {
        const lastSentence = excerpt.lastIndexOf('.');
        if (lastSentence > excerpt.length * 0.8) {
            excerpt = excerpt.substring(0, lastSentence + 1);
        } else {
            excerpt = excerpt + '...';
        }
    }
    
    return excerpt;
}

// Helper function to extract relevant text around search terms
function extractRelevantText(text, query, maxLength = 300) {
  if (!text) return '';
  
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  const index = textLower.indexOf(queryLower);
  
  if (index === -1) {
    // If exact match not found, return beginning of text
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
  
  // Extract text around the match
  const start = Math.max(0, index - Math.floor(maxLength / 3));
  const end = Math.min(text.length, start + maxLength);
  
  let excerpt = text.substring(start, end);
  
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';
  
  return excerpt;
}




/**
 * Sanitize metadata for database storage
 * @private
 */
function sanitizeMetadata(metadata) {
  // Ensure all metadata values are JSON-serializable
  const sanitized = {};
  
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      // Convert non-serializable values to strings
      if (typeof value === 'function') {
        sanitized[key] = '[Function]';
      } else if (typeof value === 'object' && value.constructor !== Object && value.constructor !== Array) {
        sanitized[key] = value.toString();
      } else {
        sanitized[key] = value;
      }
    }
  }
  
  return sanitized;
}


// Manual URL crawling (vectors-only)
router.post('/crawl-url-manual', ensureAuthenticated, async (req, res) => {
  try {
    const { url, title, group_id } = req.body;

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

    console.log(`[Documents /crawl-url-manual] Starting crawl for URL: ${url} with title: ${title}`);

    // Initialize services
    const documentService = getPostgresDocumentService();
    const documentSearchService = new DocumentSearchService();
const qdrantDocumentService = documentSearchService; // Backward compatibility

    // Import URL crawler if available
    const urlCrawlerService = (await import('../services/urlCrawlerService.js')).default;
    
    // Crawl the URL
    const crawlResult = await urlCrawlerService.crawlUrl(url.trim());
    if (!crawlResult.success || !crawlResult.content) {
      throw new Error(crawlResult.error || 'Failed to crawl URL');
    }

    // Chunk the content
    const chunks = smartChunkDocument(crawlResult.content, {
      maxTokens: 400,
      overlapTokens: 50,
      preserveStructure: true
    });

    if (chunks.length === 0) {
      throw new Error('No content could be extracted from URL');
    }

    // Generate embeddings
    const texts = chunks.map(chunk => chunk.text);
    const embeddings = await fastEmbedService.generateBatchEmbeddings(texts, 'search_document');

    // Save document metadata (no file storage)
    const documentMetadata = await documentService.saveDocumentMetadata(req.user.id, {
      title: title.trim(),
      filename: `crawled_${Date.now()}.txt`,
      sourceType: 'manual',
      vectorCount: chunks.length,
      fileSize: crawlResult.content.length,
      status: 'completed',
      additionalMetadata: {
        originalUrl: url.trim(),
        wordCount: crawlResult.wordCount || 0,
        characterCount: crawlResult.content.length
      }
    });

    // Store vectors in Qdrant only
    await qdrantDocumentService.storeDocumentVectors(
      req.user.id,
      documentMetadata.id,
      chunks,
      embeddings,
      {
        sourceType: 'manual',
        title: title.trim(),
        filename: `crawled_${Date.now()}.txt`,
        additionalPayload: {
          source_url: url.trim(),
          word_count: crawlResult.wordCount || 0,
          crawled_at: new Date().toISOString()
        }
      }
    );

    console.log(`[Documents /crawl-url-manual] Successfully processed: ${title} (${chunks.length} vectors)`);

    res.json({
      success: true,
      message: 'URL crawled and vectorized successfully',
      data: {
        id: documentMetadata.id,
        title: documentMetadata.title,
        vectorCount: chunks.length,
        sourceUrl: url.trim(),
        status: 'completed',
        created_at: documentMetadata.created_at
      }
    });
  } catch (error) {
    console.error('[Documents /crawl-url-manual] Error:', error);
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
  console.log('[Documents /upload-default] Redirecting to manual mode for new upload');
  
  // Check user's document mode preference
  try {
    const userMode = await postgresDocumentService.getUserDocumentMode(req.user.id);
    console.log(`[Documents /upload-default] User mode: ${userMode}`);
    
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
    console.error('[Documents /upload-default] Error checking user mode, defaulting to manual:', error);
    // Default to manual mode if there's an error
    req.url = '/upload-manual';
    return router.handle(req, res);
  }
});

// Default URL crawling endpoint - redirects to manual mode
router.post('/crawl-url-default', ensureAuthenticated, async (req, res) => {
  console.log('[Documents /crawl-url-default] Redirecting to manual mode for URL crawling');
  
  try {
    const userMode = await postgresDocumentService.getUserDocumentMode(req.user.id);
    console.log(`[Documents /crawl-url-default] User mode: ${userMode}`);
    
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
    console.error('[Documents /crawl-url-default] Error checking user mode, defaulting to manual:', error);
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
    
    console.log(`[Documents /:documentId/full-text] Retrieving full text for document: ${documentId}`);
    
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
    
    console.log(`[Documents /:documentId/full-text] Retrieved text with ${result.chunkCount} chunks`);
    
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
    console.error(`[Documents /:documentId/full-text] Error:`, error);
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
    
    console.log(`[Documents /bulk/full-text] Retrieving full text for ${documentIds.length} documents`);
    
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
    
    console.log(`[Documents /bulk/full-text] Retrieved ${result.documents.length} documents, ${result.errors.length} errors`);
    
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
    console.error('[Documents /bulk/full-text] Error:', error);
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
    
    console.log(`[Documents /qdrant/list] Retrieving documents list from Qdrant for user: ${req.user.id}`);
    
    const result = await qdrantDocumentService.getUserDocumentsList(req.user.id, {
      sourceType: sourceType || null,
      limit: limit ? parseInt(limit) : 1000
    });
    
    if (!result.success) {
      throw new Error('Failed to retrieve documents from Qdrant');
    }
    
    console.log(`[Documents /qdrant/list] Retrieved ${result.documents.length} documents from Qdrant`);
    
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
    console.error('[Documents /qdrant/list] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to retrieve documents from Qdrant'
    });
  }
});

// Get Qdrant vector statistics for user
router.get('/qdrant/stats', ensureAuthenticated, async (req, res) => {
  try {
    console.log(`[Documents /qdrant/stats] Getting vector stats for user: ${req.user.id}`);
    
    const stats = await qdrantDocumentService.getUserVectorStats(req.user.id);
    
    console.log(`[Documents /qdrant/stats] User has ${stats.totalVectors} vectors across ${stats.uniqueDocuments} documents`);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('[Documents /qdrant/stats] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get vector statistics'
    });
  }
});

export default router;
