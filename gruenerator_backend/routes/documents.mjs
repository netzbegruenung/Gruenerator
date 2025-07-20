import express from 'express';
import multer from 'multer';
import { supabaseService } from '../utils/supabaseClient.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { ocrService } from '../services/ocrService.js';
import { documentProcessorService } from '../services/documentProcessorService.js';
import { vectorSearchService } from '../services/vectorSearchService.js';
import { smartQueryExpansion } from '../services/smartQueryExpansion.js';
import { embeddingService } from '../services/embeddingService.js';
import { urlCrawlerService } from '../services/urlCrawlerService.js';
import path from 'path';
import { fileURLToPath } from 'url';
import passport from '../config/passportSetup.mjs';
import fs from 'fs/promises';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add Passport session middleware for documents routes
router.use(passport.session());

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/vnd.oasis.opendocument.text', // ODT
      'application/vnd.ms-excel', // XLS
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // XLSX
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, ODT, and Excel files are allowed'), false);
    }
  },
});

// Add debugging middleware to all document routes
router.use((req, res, next) => {
  console.log(`[Documents] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// Upload document
router.post('/upload', ensureAuthenticated, upload.single('document'), async (req, res) => {
  try {
    const { title, group_id, ocr_method } = req.body;
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

    // Generate unique filename with sanitized original name
    const timestamp = Date.now();
    const fileExtension = path.extname(file.originalname);
    
    // Sanitize filename: remove/replace special characters and normalize unicode
    const sanitizedOriginalName = file.originalname
      .normalize('NFD') // Decompose unicode characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics/accents
      .replace(/[^a-zA-Z0-9\-_\.]/g, '_') // Replace invalid chars with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
    
    const filename = `${timestamp}_${sanitizedOriginalName}`;
    const filePath = `documents/${req.user.id}/${filename}`;
    
    console.log('[Documents /upload] Original filename:', file.originalname);
    console.log('[Documents /upload] Sanitized filename:', sanitizedOriginalName);
    console.log('[Documents /upload] Final file path:', filePath);

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabaseService.storage
      .from('documents')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[Documents /upload] Storage upload error:', uploadError);
      throw new Error('Failed to upload file to storage');
    }

    // Create document record
    const documentData = {
      user_id: req.user.id,
      group_id: group_id || null,
      title: title.trim(),
      filename: file.originalname,
      file_path: filePath,
      file_size: file.size,
      page_count: 0, // Will be updated after OCR
      status: 'pending',
      ocr_method: ocr_method || 'tesseract'
    };

    const { data: document, error: dbError } = await supabaseService
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    if (dbError) {
      console.error('[Documents /upload] Database error:', dbError);
      // Clean up uploaded file
      await supabaseService.storage
        .from('documents')
        .remove([filePath]);
      throw new Error('Failed to save document to database');
    }

    // Start document processing in background
    documentProcessorService.processDocument(document.id, filePath, file.mimetype, ocr_method || 'tesseract')
      .catch(error => {
        console.error('[Documents /upload] Document processing failed:', error);
        // Update document status to failed
        supabaseService
          .from('documents')
          .update({ status: 'failed' })
          .eq('id', document.id)
          .then(() => console.log(`[Documents] Document ${document.id} marked as failed`));
      });

    res.json({
      success: true,
      data: document,
      message: 'Document uploaded successfully. Processing started.'
    });

  } catch (error) {
    console.error('[Documents /upload] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload document'
    });
  }
});

// Crawl URL and create document
router.post('/crawl-url', ensureAuthenticated, async (req, res) => {
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

    console.log(`[Documents /crawl-url] Starting crawl for URL: ${url} with title: ${title}`);

    // Create document record with pending status
    const documentData = {
      user_id: req.user.id,
      group_id: group_id || null,
      title: title.trim(),
      filename: `crawled_${Date.now()}.txt`,
      file_path: null, // Will be set if we store the content as a file
      file_size: 0, // Will be updated after crawling
      page_count: 1, // URL crawling typically results in single "page"
      status: 'pending',
      ocr_method: 'url_crawl',
      source_url: url.trim(),
      document_type: 'url_crawl'
    };

    const { data: document, error: dbError } = await supabaseService
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    if (dbError) {
      console.error('[Documents /crawl-url] Database error:', dbError);
      throw new Error('Failed to save document to database');
    }

    // Process URL crawling and wait for completion
    try {
      await processCrawledDocument(document.id, url.trim());
      
      // Fetch the updated document with completed status and content
      const { data: updatedDocument, error: fetchError } = await supabaseService
        .from('documents')
        .select('*')
        .eq('id', document.id)
        .single();

      if (fetchError) {
        throw new Error('Failed to fetch updated document');
      }

      res.json({
        success: true,
        data: updatedDocument,
        message: 'URL crawling completed successfully.'
      });

    } catch (processingError) {
      console.error('[Documents /crawl-url] URL crawling failed:', processingError);
      
      // Update document status to failed
      await supabaseService
        .from('documents')
        .update({ status: 'failed' })
        .eq('id', document.id);

      // Return error response
      return res.status(500).json({
        success: false,
        message: processingError.message || 'Failed to crawl and process URL'
      });
    }

  } catch (error) {
    console.error('[Documents /crawl-url] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to crawl URL'
    });
  }
});

// Get user documents
router.get('/user', ensureAuthenticated, async (req, res) => {
  try {
    console.log('[Documents /user] Request received for user:', req.user?.id);
    const { data: documents, error } = await supabaseService
      .from('documents')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Documents /user] Database error:', error);
      throw new Error('Failed to fetch documents');
    }

    res.json({
      success: true,
      data: documents,
      message: `Found ${documents.length} documents`
    });

  } catch (error) {
    console.error('[Documents /user] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch documents'
    });
  }
});

// Get group documents
router.get('/group/:groupId', ensureAuthenticated, async (req, res) => {
  try {
    const { groupId } = req.params;

    // TODO: Add group membership verification

    const { data: documents, error } = await supabaseService
      .from('documents')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Documents /group] Database error:', error);
      throw new Error('Failed to fetch group documents');
    }

    res.json({
      success: true,
      data: documents,
      message: `Found ${documents.length} group documents`
    });

  } catch (error) {
    console.error('[Documents /group] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch group documents'
    });
  }
});

// Bulk delete documents
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

    // First, verify all documents belong to the user and get their file paths
    console.log('[Documents] Starting ownership verification...');
    const { data: verifyDocuments, error: verifyError } = await supabaseService
      .from('documents')
      .select('id, file_path, title')
      .eq('user_id', req.user.id)
      .in('id', ids);

    console.log('[Documents] Ownership verification result:', {
      error: verifyError,
      documentsFound: verifyDocuments?.length || 0,
      documents: verifyDocuments
    });

    if (verifyError) {
      console.error('[Documents] Error verifying document ownership:', verifyError);
      throw new Error('Failed to verify document ownership');
    }

    const ownedIds = verifyDocuments.map(doc => doc.id);
    const unauthorizedIds = ids.filter(id => !ownedIds.includes(id));

    console.log('[Documents] Ownership analysis:', {
      requestedIds: ids,
      ownedIds: ownedIds,
      unauthorizedIds: unauthorizedIds,
      authorizationPassed: unauthorizedIds.length === 0
    });

    if (unauthorizedIds.length > 0) {
      console.log('[Documents] AUTHORIZATION FAILED - returning 403');
      return res.status(403).json({
        success: false,
        message: `Access denied for documents: ${unauthorizedIds.join(', ')}`,
        unauthorized_ids: unauthorizedIds
      });
    }

    // Collect file paths for storage cleanup
    const filesToDelete = verifyDocuments
      .filter(doc => doc.file_path)
      .map(doc => doc.file_path);

    let storageDeleteCount = 0;
    let storageFailCount = 0;

    // Delete files from storage in batches
    if (filesToDelete.length > 0) {
      console.log(`[Documents] Deleting ${filesToDelete.length} files from storage`);
      
      // Process in smaller batches to avoid timeouts
      const batchSize = 10;
      for (let i = 0; i < filesToDelete.length; i += batchSize) {
        const batch = filesToDelete.slice(i, i + batchSize);
        
        try {
          const { error: storageError } = await supabaseService.storage
            .from('documents')
            .remove(batch);

          if (storageError) {
            console.warn(`[Documents] Storage deletion warning for batch ${i/batchSize + 1}:`, storageError);
            storageFailCount += batch.length;
          } else {
            storageDeleteCount += batch.length;
          }
        } catch (batchError) {
          console.warn(`[Documents] Storage batch deletion error:`, batchError);
          storageFailCount += batch.length;
        }
      }
    }

    // Delete document records from database
    console.log('[Documents] Starting bulk delete operation...');
    const { data: deletedData, error: deleteError } = await supabaseService
      .from('documents')
      .delete()
      .eq('user_id', req.user.id)
      .in('id', ids)
      .select('id');

    console.log('[Documents] Bulk delete operation result:', {
      error: deleteError,
      deletedCount: deletedData?.length || 0,
      deletedData: deletedData
    });

    if (deleteError) {
      console.error('[Documents] Error during bulk delete:', deleteError);
      throw new Error('Failed to delete documents from database');
    }

    const deletedIds = deletedData ? deletedData.map(doc => doc.id) : [];
    const failedIds = ids.filter(id => !deletedIds.includes(id));

    console.log(`[Documents] Bulk delete completed: ${deletedIds.length} deleted, ${failedIds.length} failed`);
    if (filesToDelete.length > 0) {
      console.log(`[Documents] Storage cleanup: ${storageDeleteCount} files deleted, ${storageFailCount} files failed`);
    }

    res.json({
      success: true,
      message: `Bulk delete completed: ${deletedIds.length} of ${ids.length} documents deleted successfully`,
      deleted_count: deletedIds.length,
      failed_ids: failedIds,
      total_requested: ids.length,
      deleted_ids: deletedIds,
      storage_cleanup: {
        files_deleted: storageDeleteCount,
        files_failed: storageFailCount,
        total_files: filesToDelete.length
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

// Delete document
router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Get document to check ownership and get file path
    const { data: document, error: getError } = await supabaseService
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id) // Ensure user owns the document
      .single();

    if (getError || !document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }

    // Delete file from storage (only if there's a file_path)
    if (document.file_path) {
      const { error: storageError } = await supabaseService.storage
        .from('documents')
        .remove([document.file_path]);

      if (storageError) {
        console.warn('[Documents /delete] Storage deletion warning:', storageError);
        // Continue with database deletion even if storage fails
      }
    } else {
      console.log('[Documents /delete] No file_path found, skipping storage deletion (likely a crawled URL document)');
    }

    // Delete document record
    const { error: deleteError } = await supabaseService
      .from('documents')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[Documents /delete] Database error:', deleteError);
      throw new Error('Failed to delete document from database');
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('[Documents /delete] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete document'
    });
  }
});

// Search documents
router.post('/search', ensureAuthenticated, async (req, res) => {
  try {
    const { query, limit = 5, useVector = true, searchMode = 'hybrid' } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    console.log(`[Documents /search] Search request: "${query}" (user: ${req.user.id}, useVector: ${useVector}, mode: ${searchMode})`);

    let searchResult;

    if (useVector) {
      // Choose search method based on mode
      if (searchMode === 'hybrid') {
        // Use new hybrid search for best results
        searchResult = await vectorSearchService.hybridSearch(
          query.trim(), 
          req.user.id, 
          { 
            limit: Math.min(Math.max(1, limit), 20),
            vectorWeight: 0.7,
            keywordWeight: 0.3
          }
        );
      } else {
        // Use enhanced vector similarity search
        searchResult = await vectorSearchService.searchDocuments(
          query.trim(), 
          req.user.id, 
          { 
            limit: Math.min(Math.max(1, limit), 20),
            threshold: null, // Use dynamic threshold
            includeKeywordSearch: true // Allow fallback to keyword search
          }
        );
      }
    } else {
      // Fallback to keyword search
      const { data: documents, error } = await supabaseService
        .from('documents')
        .select('id, title, filename, ocr_text, created_at')
        .eq('user_id', req.user.id)
        .eq('status', 'completed')
        .ilike('ocr_text', `%${query.trim()}%`)
        .limit(limit);

      if (error) {
        throw new Error('Failed to search documents');
      }

      const results = documents.map(doc => ({
        document_id: doc.id,
        title: doc.title,
        filename: doc.filename,
        relevant_content: extractRelevantText(doc.ocr_text, query, 300),
        created_at: doc.created_at,
        relevance_info: `Text match found in "${doc.title}"`
      }));

      searchResult = {
        success: true,
        results,
        query: query.trim(),
        searchType: 'keyword',
        message: `Found ${results.length} relevant documents`
      };
    }

    // Transform results for backward compatibility
    const compatibleResults = searchResult.results.map(doc => ({
      id: doc.document_id,
      title: doc.title,
      filename: doc.filename,
      relevantText: doc.relevant_content,
      created_at: doc.created_at,
      similarity_score: doc.similarity_score,
      relevance_info: doc.relevance_info
    }));

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

// Get document content (for debugging)
router.get('/:id/content', ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: document, error } = await supabaseService
      .from('documents')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found or access denied'
      });
    }

    res.json({
      success: true,
      data: {
        id: document.id,
        title: document.title,
        filename: document.filename,
        status: document.status,
        page_count: document.page_count,
        ocr_text: document.ocr_text,
        markdown_content: document.markdown_content,
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

// Get search performance stats
router.get('/search/stats', ensureAuthenticated, async (req, res) => {
  try {
    const { embeddingCache } = await import('../services/embeddingCache.js');
    
    // Get cache stats
    const cacheStats = await embeddingCache.getStats();
    
    // Get embedding stats for user
    const { data: embeddingStats, error } = await supabaseService
      .rpc('get_embedding_stats', { user_id_filter: req.user.id });

    if (error) {
      console.warn('[Documents /search/stats] Failed to get embedding stats:', error);
    }

    res.json({
      success: true,
      data: {
        cache: cacheStats,
        embeddings: embeddingStats?.[0] || {
          total_documents: 0,
          documents_with_embeddings: 0,
          total_chunks: 0,
          avg_chunks_per_document: 0
        },
        optimizations: {
          dynamic_thresholds: true,
          enhanced_scoring: true,
          german_enhancement: true,
          embedding_cache: cacheStats.enabled,
          hybrid_search: true,
          multi_stage_pipeline: true
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

// Test smart query expansion endpoint
router.post('/search/expansion-test', ensureAuthenticated, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    console.log(`[Documents /search/expansion-test] Testing smart expansion: "${query}"`);

    // Test smart query expansion
    const expansion = await smartQueryExpansion.expandQuery(query.trim(), req.user.id);

    res.json({
      success: true,
      data: {
        originalQuery: query.trim(),
        expansion: expansion,
        cacheStats: smartQueryExpansion.getCacheStats()
      }
    });

  } catch (error) {
    console.error('[Documents /search/expansion-test] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to test smart expansion'
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
      vectorSearchService.searchDocuments(query.trim(), req.user.id, { limit }),
      vectorSearchService.hybridSearch(query.trim(), req.user.id, { limit })
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

        // Verify user owns the requested documents
        const { data: userDocuments, error: accessError } = await supabaseService
            .from('documents')
            .select('id, title, filename, page_count, ocr_text, created_at')
            .eq('user_id', userId)
            .eq('status', 'completed')
            .in('id', documentIds);

        if (accessError) {
            console.error('[Documents API] Access verification error:', accessError);
            return res.status(500).json({ error: 'Failed to verify document access' });
        }

        if (!userDocuments || userDocuments.length === 0) {
            return res.status(404).json({ error: 'No accessible documents found' });
        }

        // Filter to only documents the user actually owns
        const accessibleDocumentIds = userDocuments.map(doc => doc.id);
        const filteredDocumentIds = documentIds.filter(id => accessibleDocumentIds.includes(id));

        if (filteredDocumentIds.length === 0) {
            return res.status(403).json({ error: 'Access denied to requested documents' });
        }

        // Perform vector search across the specified documents
        let searchResults = [];
        try {
            const searchResponse = await vectorSearchService.search({
                query: trimmedQuery,
                user_id: userId,
                documentIds: filteredDocumentIds,
                limit: limit * 2, // Get more results for better content selection
                mode: mode
            });
            searchResults = searchResponse.results || [];
            
            console.log(`[Documents API] Vector search found ${searchResults.length} results`);
        } catch (searchError) {
            console.error('[Documents API] Vector search error:', searchError);
            // Continue with fallback approach if vector search fails
        }

        // Process results and create intelligent content extracts
        const documentContents = new Map();
        
        if (searchResults.length > 0) {
            // Use vector search results to create intelligent content
            searchResults.forEach(result => {
                const docId = result.document_id;
                const content = result.relevant_content || result.chunk_text || '';
                
                if (!documentContents.has(docId)) {
                    const docInfo = userDocuments.find(d => d.id === docId);
                    documentContents.set(docId, {
                        document_id: docId,
                        title: docInfo?.title || result.title,
                        filename: docInfo?.filename || result.filename,
                        page_count: docInfo?.page_count || null,
                        content_type: 'vector_search',
                        content: content,
                        similarity_score: result.similarity_score,
                        search_info: result.relevance_info || `Vector search found relevant content`
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
        
        // For documents not found in vector search or if vector search failed,
        // fall back to intelligent excerpts from full text
        userDocuments.forEach(doc => {
            if (!documentContents.has(doc.id)) {
                let content = '';
                let contentType = 'full_text';
                
                if (doc.ocr_text) {
                    // Smart size threshold logic considering multiple factors
                    const shouldUseFullContent = determineContentStrategy(doc, trimmedQuery);
                    
                    if (shouldUseFullContent) {
                        content = doc.ocr_text;
                        contentType = 'full_text';
                    } else {
                        // For longer documents without vector results, create intelligent excerpt
                        content = createIntelligentExcerpt(doc.ocr_text, trimmedQuery, 1500);
                        contentType = 'intelligent_excerpt';
                    }
                }
                
                documentContents.set(doc.id, {
                    document_id: doc.id,
                    title: doc.title,
                    filename: doc.filename,
                    page_count: doc.page_count,
                    content_type: contentType,
                    content: content,
                    similarity_score: null,
                    search_info: contentType === 'full_text' 
                        ? 'Short document - full content included'
                        : 'Long document - intelligent excerpt created'
                });
            }
        });

        const results = Array.from(documentContents.values());
        const responseTime = Date.now() - startTime;

        console.log(`[Documents API] Returning ${results.length} document contents (${responseTime}ms)`);

        res.json({
            success: true,
            results: results,
            query: trimmedQuery,
            search_mode: mode,
            metadata: {
                response_time_ms: responseTime,
                documents_processed: results.length,
                vector_search_results: searchResults.length,
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


// Upload grundsatz document (political documents)
router.post('/upload-grundsatz', upload.single('document'), async (req, res) => {
  try {
    const { title, document_type, description, publication_date } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    if (!title || !document_type) {
      return res.status(400).json({
        success: false,
        message: 'Title and document_type are required'
      });
    }

    // Validate document_type
    const validTypes = ['grundsatzprogramm', 'wahlprogramm_eu', 'regierungsprogramm'];
    if (!validTypes.includes(document_type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid document_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Generate unique filename with sanitized original name
    const timestamp = Date.now();
    const fileExtension = path.extname(file.originalname);
    
    // Sanitize filename: remove/replace special characters and normalize unicode
    const sanitizedOriginalName = file.originalname
      .normalize('NFD') // Decompose unicode characters
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics/accents
      .replace(/[^a-zA-Z0-9\-_\.]/g, '_') // Replace invalid chars with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
    
    const filename = `${timestamp}_${sanitizedOriginalName}`;
    const filePath = `grundsatz/${document_type}/${filename}`;
    
    console.log('[Documents /upload-grundsatz] Original filename:', file.originalname);
    console.log('[Documents /upload-grundsatz] Sanitized filename:', sanitizedOriginalName);
    console.log('[Documents /upload-grundsatz] Final file path:', filePath);

    // Upload file to Supabase Storage
    const { error: uploadError } = await supabaseService.storage
      .from('documents')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[Documents /upload-grundsatz] Storage upload error:', uploadError);
      throw new Error('Failed to upload file to storage');
    }

    // Create grundsatz document record
    const documentData = {
      title: title.trim(),
      filename: file.originalname,
      file_path: filePath,
      file_size: file.size,
      page_count: 0, // Will be updated after OCR
      status: 'pending',
      document_type: document_type,
      description: description?.trim() || null,
      publication_date: publication_date || null
    };

    const { data: document, error: dbError } = await supabaseService
      .from('grundsatz_documents')
      .insert(documentData)
      .select()
      .single();

    if (dbError) {
      console.error('[Documents /upload-grundsatz] Database error:', dbError);
      // Clean up uploaded file
      await supabaseService.storage
        .from('documents')
        .remove([filePath]);
      throw new Error('Failed to save document to database');
    }

    // Start OCR processing in background for grundsatz documents
    processGrundsatzDocument(document.id, filePath)
      .catch(error => {
        console.error('[Documents /upload-grundsatz] OCR processing failed:', error);
        // Update document status to failed
        supabaseService
          .from('grundsatz_documents')
          .update({ status: 'failed' })
          .eq('id', document.id)
          .then(() => console.log(`[Documents] Grundsatz document ${document.id} marked as failed`));
      });

    res.json({
      success: true,
      data: document,
      message: 'Grundsatz document uploaded successfully. OCR processing started.'
    });

  } catch (error) {
    console.error('[Documents /upload-grundsatz] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload grundsatz document'
    });
  }
});

// Get all grundsatz documents
router.get('/grundsatz', async (req, res) => {
  try {
    console.log('[Documents /grundsatz] Request received');
    const { data: documents, error } = await supabaseService
      .from('grundsatz_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Documents /grundsatz] Database error:', error);
      throw new Error('Failed to fetch grundsatz documents');
    }

    res.json({
      success: true,
      data: documents,
      message: `Found ${documents.length} grundsatz documents`
    });

  } catch (error) {
    console.error('[Documents /grundsatz] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch grundsatz documents'
    });
  }
});

// Process grundsatz document with OCR and embeddings
async function processGrundsatzDocument(documentId, filePath) {
  console.log(`[processGrundsatzDocument] Starting processing for document ${documentId}`);

  try {
    // Update status to processing
    await supabaseService
      .from('grundsatz_documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Use existing OCR service logic but adapted for grundsatz documents
    const { data, error } = await supabaseService.storage
      .from('documents')
      .download(filePath);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    // Create temp file
    const os = await import('os');
    const tempDir = os.tmpdir();
    const tempFileName = `grundsatz_ocr_${Date.now()}_${path.basename(filePath)}`;
    const tempFilePath = path.join(tempDir, tempFileName);

    // Convert blob to buffer and write to temp file
    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tempFilePath, buffer);

    // Process with OCR (reuse existing OCR logic)
    const { text, pageCount } = await ocrService.extractTextFromPDF(tempFilePath);
    
    // Update document with OCR results
    await supabaseService
      .from('grundsatz_documents')
      .update({
        status: 'processing_embeddings',
        ocr_text: text,
        page_count: pageCount
      })
      .eq('id', documentId);

    console.log(`[processGrundsatzDocument] OCR completed for document ${documentId}, starting embedding generation`);

    // Generate embeddings for the document
    await generateGrundsatzDocumentEmbeddings(documentId, text);

    // Mark document as fully completed
    await supabaseService
      .from('grundsatz_documents')
      .update({ status: 'completed' })
      .eq('id', documentId);

    // Clean up temp file
    await fs.unlink(tempFilePath);

    console.log(`[processGrundsatzDocument] Successfully processed grundsatz document ${documentId}`);

  } catch (error) {
    console.error(`[processGrundsatzDocument] Error processing document ${documentId}:`, error);
    // Mark document as failed
    await supabaseService
      .from('grundsatz_documents')
      .update({ status: 'failed' })
      .eq('id', documentId);
    throw error;
  }
}

// Generate embeddings for grundsatz document chunks
async function generateGrundsatzDocumentEmbeddings(documentId, text) {
  try {
    console.log(`[generateGrundsatzDocumentEmbeddings] Generating embeddings for document ${documentId}`);

    // Split document into chunks
    const { smartChunkDocument } = await import('../utils/textChunker.js');
    const chunks = smartChunkDocument(text, {
      maxTokens: 400,
      overlapTokens: 50,
      preserveStructure: true
    });

    if (chunks.length === 0) {
      console.warn(`[generateGrundsatzDocumentEmbeddings] No chunks generated for document ${documentId}`);
      return;
    }

    console.log(`[generateGrundsatzDocumentEmbeddings] Generated ${chunks.length} chunks for document ${documentId}`);

    // Generate embeddings for chunks in batches
    const batchSize = 10;
    const allChunkData = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`[generateGrundsatzDocumentEmbeddings] Processing embedding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);

      try {
        // Generate embeddings for this batch
        const texts = batch.map(chunk => chunk.text);
        const embeddings = await embeddingService.generateBatchEmbeddings(texts, 'search_document');

        // Prepare chunk data for database insertion
        const batchChunkData = batch.map((chunk, index) => ({
          document_id: documentId,
          chunk_index: chunk.index,
          chunk_text: chunk.text,
          embedding: embeddings[index],
          token_count: chunk.tokens
        }));

        allChunkData.push(...batchChunkData);

      } catch (batchError) {
        console.error(`[generateGrundsatzDocumentEmbeddings] Error processing embedding batch:`, batchError);
        // Continue with other batches
      }
    }

    if (allChunkData.length === 0) {
      throw new Error('No embeddings were generated successfully');
    }

    // Insert all chunks into grundsatz_document_chunks table
    const { error: insertError } = await supabaseService
      .from('grundsatz_document_chunks')
      .insert(allChunkData);

    if (insertError) {
      throw new Error(`Failed to insert grundsatz document chunks: ${insertError.message}`);
    }

    console.log(`[generateGrundsatzDocumentEmbeddings] Successfully generated embeddings for ${allChunkData.length} chunks in grundsatz document ${documentId}`);

  } catch (error) {
    console.error(`[generateGrundsatzDocumentEmbeddings] Error generating embeddings for document ${documentId}:`, error);
    throw error;
  }
}

// Process crawled document and generate embeddings
async function processCrawledDocument(documentId, url) {
  console.log(`[processCrawledDocument] Starting processing for document ${documentId} from URL: ${url}`);

  try {
    // Update status to processing
    await supabaseService
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', documentId);

    // Crawl the URL using our crawler service
    const crawlResult = await urlCrawlerService.crawlUrl(url);

    if (!crawlResult.success) {
      throw new Error(crawlResult.error || 'Failed to crawl URL');
    }

    const crawledData = crawlResult.data;
    
    // Update document with crawled content
    await supabaseService
      .from('documents')
      .update({
        status: 'processing_embeddings',
        ocr_text: crawledData.content,
        markdown_content: crawledData.markdownContent,
        file_size: crawledData.characterCount,
        page_count: 1,
        // Store additional metadata in a metadata column if it exists
        metadata: JSON.stringify({
          originalUrl: crawledData.originalUrl,
          canonical: crawledData.canonical,
          description: crawledData.description,
          publicationDate: crawledData.publicationDate,
          wordCount: crawledData.wordCount,
          characterCount: crawledData.characterCount,
          contentSource: crawledData.contentSource,
          extractedAt: crawledData.extractedAt
        })
      })
      .eq('id', documentId);

    console.log(`[processCrawledDocument] Successfully crawled content for document ${documentId}, starting embedding generation`);

    // Generate embeddings for the crawled content using existing embedding logic
    await generateDocumentEmbeddings(documentId, crawledData.content);

    // Mark document as fully completed
    await supabaseService
      .from('documents')
      .update({ status: 'completed' })
      .eq('id', documentId);

    console.log(`[processCrawledDocument] Successfully processed crawled document ${documentId}`);

  } catch (error) {
    console.error(`[processCrawledDocument] Error processing document ${documentId}:`, error);
    // Mark document as failed
    await supabaseService
      .from('documents')
      .update({ 
        status: 'failed',
        ocr_text: `Failed to crawl URL: ${error.message}`
      })
      .eq('id', documentId);
    throw error;
  }
}

// Generate embeddings for regular document chunks (reuse existing logic)
async function generateDocumentEmbeddings(documentId, text) {
  try {
    console.log(`[generateDocumentEmbeddings] Generating embeddings for document ${documentId}`);

    // Import text chunker (same as used in OCR service)
    const { smartChunkDocument } = await import('../utils/textChunker.js');
    const chunks = smartChunkDocument(text, {
      maxTokens: 400,
      overlapTokens: 50,
      preserveStructure: true
    });

    if (chunks.length === 0) {
      console.warn(`[generateDocumentEmbeddings] No chunks generated for document ${documentId}`);
      return;
    }

    console.log(`[generateDocumentEmbeddings] Generated ${chunks.length} chunks for document ${documentId}`);

    // Generate embeddings for chunks in batches
    const batchSize = 10;
    const allChunkData = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`[generateDocumentEmbeddings] Processing embedding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);

      try {
        // Generate embeddings for this batch
        const texts = batch.map(chunk => chunk.text);
        const embeddings = await embeddingService.generateBatchEmbeddings(texts, 'search_document');

        // Prepare chunk data for database insertion
        const batchChunkData = batch.map((chunk, index) => ({
          document_id: documentId,
          chunk_index: chunk.index,
          chunk_text: chunk.text,
          embedding: embeddings[index],
          token_count: chunk.tokens
        }));

        allChunkData.push(...batchChunkData);

      } catch (batchError) {
        console.error(`[generateDocumentEmbeddings] Error processing embedding batch:`, batchError);
        // Continue with other batches
      }
    }

    if (allChunkData.length === 0) {
      throw new Error('No embeddings were generated successfully');
    }

    // Insert all chunks into document_chunks table
    const { error: insertError } = await supabaseService
      .from('document_chunks')
      .insert(allChunkData);

    if (insertError) {
      throw new Error(`Failed to insert document chunks: ${insertError.message}`);
    }

    console.log(`[generateDocumentEmbeddings] Successfully generated embeddings for ${allChunkData.length} chunks in document ${documentId}`);

  } catch (error) {
    console.error(`[generateDocumentEmbeddings] Error generating embeddings for document ${documentId}:`, error);
    throw error;
  }
}

export default router;