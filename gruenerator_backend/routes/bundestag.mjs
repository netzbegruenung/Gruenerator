import express from 'express';
import bundestagApiClient from '../services/bundestagApiClient.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import passport from '../config/passportSetup.mjs';
import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from '../services/embeddingService.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;

const router = express.Router();

// Add Passport session middleware for bundestag routes  
router.use(passport.session());

/**
 * Search parliamentary documents via Bundestag API
 * POST /api/bundestag/search
 */
router.post('/search', async (req, res) => {
  try {
    const { 
      query, 
      includeDrucksachen = true,
      includePlenarprotokolle = true,
      includeVorgaenge = false,
      maxDrucksachen = 5,
      maxPlenarprotokolle = 3,
      maxVorgaenge = 2
    } = req.body;

    // Validate request
    if (!query || typeof query !== 'string' || query.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Query must be at least 3 characters long'
      });
    }

    // Check if user has Bundestag API enabled
    // Note: This will be implemented when user profile checking is available
    // For now, we'll allow all authenticated users to use this feature

    console.log(`[Bundestag API] Search request for: "${query}" by user: ${req.user?.id}`);

    // Perform search using the Bundestag API client
    const searchResults = await bundestagApiClient.searchAll(query.trim(), {
      includeDrucksachen,
      includePlenarprotokolle,
      includeVorgaenge,
      maxDrucksachen: Math.min(maxDrucksachen, 10), // Cap at 10
      maxPlenarprotokolle: Math.min(maxPlenarprotokolle, 5), // Cap at 5
      maxVorgaenge: Math.min(maxVorgaenge, 3) // Cap at 3
    });

    res.json({
      success: true,
      query: query.trim(),
      results: searchResults.results,
      totalResults: searchResults.totalResults,
      metadata: {
        searchTime: new Date().toISOString(),
        userId: req.user?.id
      }
    });

  } catch (error) {
    console.error('[Bundestag API] Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search parliamentary documents',
      details: error.message
    });
  }
});

/**
 * Get specific document by ID and type
 * GET /api/bundestag/document/:type/:id
 */
router.get('/document/:type/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { type, id } = req.params;

    // Validate parameters
    const validTypes = ['drucksache', 'plenarprotokoll', 'vorgang'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid document type'
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Document ID is required'
      });
    }

    console.log(`[Bundestag API] Document request for: ${type}/${id} by user: ${req.user?.id}`);

    // Fetch document using the Bundestag API client
    const document = await bundestagApiClient.getDocumentById(id, type);

    res.json({
      success: true,
      document,
      metadata: {
        fetchTime: new Date().toISOString(),
        userId: req.user?.id
      }
    });

  } catch (error) {
    console.error('[Bundestag API] Document fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch document',
      details: error.message
    });
  }
});

/**
 * Test Bundestag API connection
 * GET /api/bundestag/test
 */
router.get('/test', ensureAuthenticated, async (req, res) => {
  try {
    console.log(`[Bundestag API] Connection test by user: ${req.user?.id}`);

    const isConnected = await bundestagApiClient.testConnection();

    res.json({
      success: true,
      connected: isConnected,
      message: isConnected ? 'Bundestag API is reachable' : 'Bundestag API is not reachable',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Bundestag API] Connection test error:', error);
    res.status(500).json({
      success: false,
      connected: false,
      error: 'Failed to test connection',
      details: error.message
    });
  }
});

/**
 * Save a Bundestag document to user's document library
 * POST /api/bundestag/save-to-documents
 */
router.post('/save-to-documents', ensureAuthenticated, async (req, res) => {
  try {
    const { bundestagDocument } = req.body;

    if (!bundestagDocument) {
      return res.status(400).json({
        success: false,
        error: 'Bundestag document data is required'
      });
    }

    const { id, type, title, nummer, wahlperiode, dokumentart, abstract, date, initiative, fundstelle, text } = bundestagDocument;

    if (!id || !type || !title) {
      return res.status(400).json({
        success: false,
        error: 'Document id, type, and title are required'
      });
    }

    console.log(`[Bundestag API] Save to documents request for: ${type}/${id} by user: ${req.user?.id}`);
    console.log(`[Bundestag API] Document metadata:`, {
      hasAbstract: !!abstract,
      abstractType: typeof abstract,
      abstractValue: abstract === undefined ? 'UNDEFINED' : (abstract === null ? 'NULL' : abstract),
      hasInitiative: !!initiative,
      hasNumber: !!nummer,
      hasWahlperiode: !!wahlperiode,
      hasTextFromSearch: !!text,
      textLength: text ? text.length : 0
    });

    // Create a comprehensive title with metadata
    let documentTitle = title;
    if (nummer) {
      documentTitle = `${documentTitle} (${type === 'drucksache' ? 'Drs.' : 'Nr.'} ${nummer})`;
    }
    if (wahlperiode) {
      documentTitle = `${documentTitle} - ${wahlperiode}. WP`;
    }

    // Use text content in priority order: 1) from search results, 2) API fetch, 3) metadata fallback
    let documentContent = '';
    let hasFullContent = false;
    let textSource = 'none';
    
    // First priority: Use text from search results if available
    if (text && text.trim().length > 0) {
      documentContent = text;
      hasFullContent = true;
      textSource = 'search_results';
      console.log(`[Bundestag API] Using text from search results (${documentContent.length} characters)`);
    } else {
      // Second priority: Try to fetch document content from Bundestag API
      try {
        console.log(`[Bundestag API] No text from search results, attempting to fetch from API for ${type}/${id}`);
        const fullDocument = await bundestagApiClient.getDocumentById(id, type);
        
        console.log(`[Bundestag API] API response received:`, {
          hasDocument: !!fullDocument,
          hasText: !!fullDocument?.text,
          textLength: fullDocument?.text ? fullDocument.text.length : 0,
          documentFields: fullDocument ? Object.keys(fullDocument) : []
        });
        
        if (fullDocument && fullDocument.text) {
          documentContent = fullDocument.text;
          hasFullContent = true;
          textSource = 'api_fetch';
          console.log(`[Bundestag API] Successfully fetched document content from API (${documentContent.length} characters)`);
        } else {
          console.log(`[Bundestag API] No text content available from API - will use metadata fallback`);
        }
      } catch (contentError) {
        console.warn(`[Bundestag API] Could not fetch full content for ${type}/${id}:`, contentError.message);
        // Continue without full content - we'll use metadata fallback
      }
    }

    // If we don't have full content, create a document from available metadata
    if (!hasFullContent) {
      console.log(`[Bundestag API] Creating metadata fallback content`);
      textSource = 'metadata_fallback';
      const metadataContent = [];
      
      metadataContent.push(`# ${title}`);
      metadataContent.push('');
      
      if (abstract && abstract !== undefined && abstract !== null) {
        metadataContent.push('## Zusammenfassung');
        metadataContent.push(abstract);
        metadataContent.push('');
      } else {
        console.log(`[Bundestag API] Skipping abstract section - value is:`, {
          abstract,
          type: typeof abstract,
          isUndefined: abstract === undefined,
          isNull: abstract === null
        });
      }
      
      if (initiative && initiative.length > 0) {
        metadataContent.push('## Initiative');
        metadataContent.push(initiative.join(', '));
        metadataContent.push('');
      }
      
      if (dokumentart) {
        metadataContent.push('## Dokumentart');
        metadataContent.push(dokumentart);
        metadataContent.push('');
      }
      
      if (date) {
        metadataContent.push('## Datum');
        metadataContent.push(new Date(date).toLocaleDateString('de-DE'));
        metadataContent.push('');
      }
      
      if (fundstelle) {
        metadataContent.push('## Fundstelle');
        metadataContent.push(fundstelle);
        metadataContent.push('');
      }
      
      metadataContent.push('---');
      metadataContent.push('');
      metadataContent.push('*Dieses Dokument wurde aus der Bundestag-Dokumentensuche importiert. Volltext nicht verfügbar.*');
      
      documentContent = metadataContent.join('\n');
    }

    // Create document record in user's documents
    const documentData = {
      user_id: req.user.id,
      title: documentTitle,
      filename: `bundestag_${type}_${id}.txt`,
      file_path: null, // No physical file for Bundestag documents
      file_size: documentContent.length,
      page_count: 1,
      status: 'processing_embeddings',
      ocr_method: 'url_crawl',
      ocr_text: documentContent,
      document_type: 'bundestag_document',
      source_url: bundestagDocument.url || `https://dip.bundestag.de/vorgang/${id}`,
      metadata: JSON.stringify({
        bundestag_id: id,
        bundestag_type: type,
        nummer,
        wahlperiode,
        dokumentart,
        initiative,
        fundstelle,
        original_date: date,
        has_full_content: hasFullContent,
        text_source: textSource,
        imported_at: new Date().toISOString()
      })
    };

    const { data: document, error: dbError } = await supabaseService
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    if (dbError) {
      console.error('[Bundestag API] Database error:', dbError);
      throw new Error('Failed to save document to database');
    }

    console.log(`[Bundestag API] Successfully created document ${document.id} for Bundestag ${type}/${id}`);

    // Generate embeddings for the document content in background
    generateBundestagDocumentEmbeddings(document.id, documentContent)
      .then(() => {
        console.log(`[Bundestag API] Successfully generated embeddings for document ${document.id}`);
        // Update document status to completed
        return supabaseService
          .from('documents')
          .update({ status: 'completed' })
          .eq('id', document.id);
      })
      .catch(error => {
        console.error(`[Bundestag API] Failed to generate embeddings for document ${document.id}:`, error);
        // Update document status to failed
        supabaseService
          .from('documents')
          .update({ status: 'failed' })
          .eq('id', document.id)
          .then(() => console.log(`[Bundestag API] Document ${document.id} marked as failed`));
      });

    res.json({
      success: true,
      data: document,
      message: 'Bundestag document saved successfully to your library.'
    });

  } catch (error) {
    console.error('[Bundestag API] Save to documents error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save Bundestag document',
      details: error.message
    });
  }
});

/**
 * Generate embeddings for Bundestag document content
 * @param {string} documentId - Document ID
 * @param {string} content - Document content
 */
async function generateBundestagDocumentEmbeddings(documentId, content) {
  try {
    console.log(`[generateBundestagDocumentEmbeddings] Generating embeddings for document ${documentId}`);

    // Split document into chunks
    const { smartChunkDocument } = await import('../utils/textChunker.js');
    const chunks = smartChunkDocument(content, {
      maxTokens: 400,
      overlapTokens: 50,
      preserveStructure: true
    });

    if (chunks.length === 0) {
      console.warn(`[generateBundestagDocumentEmbeddings] No chunks generated for document ${documentId}`);
      return;
    }

    console.log(`[generateBundestagDocumentEmbeddings] Generated ${chunks.length} chunks for document ${documentId}`);

    // Generate embeddings for chunks in batches
    const batchSize = 10;
    const allChunkData = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      console.log(`[generateBundestagDocumentEmbeddings] Processing embedding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(chunks.length/batchSize)}`);

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
        console.error(`[generateBundestagDocumentEmbeddings] Error processing embedding batch:`, batchError);
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

    console.log(`[generateBundestagDocumentEmbeddings] Successfully generated embeddings for ${allChunkData.length} chunks in document ${documentId}`);

  } catch (error) {
    console.error(`[generateBundestagDocumentEmbeddings] Error generating embeddings for document ${documentId}:`, error);
    throw error;
  }
}

export default router;