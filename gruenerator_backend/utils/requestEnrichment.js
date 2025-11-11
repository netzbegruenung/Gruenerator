/**
 * Unified Request Enrichment Service
 * Centralizes all content enrichment logic for route optimization
 * Handles URL detection, attachment processing, web search, and document aggregation
 */

const { extractUrlsFromContent, filterNewUrls, getUrlDomain } = require('./urlDetection.js');
const { processAndBuildAttachments } = require('./attachmentUtils.js');
const { extractLocaleFromRequest } = require('./localizationHelper.js');
const { getQdrantDocumentService } = require('../services/DocumentSearchService.js');

// Import services with fallback handling
const { urlCrawlerService } = (() => {
  try { return require('../services/urlCrawlerService.js'); } catch (_) { return { urlCrawlerService: null }; }
})();

const searxngWebSearchService = (() => {
  try { return require('../services/searxngWebSearchService'); } catch (_) { return null; }
})();

/**
 * Main request enrichment class
 */
class RequestEnricher {
  constructor() {
    this.maxConcurrentUrls = 3;
    this.urlCrawlTimeout = 15000;
  }

  /**
   * Format knowledge entries with detailed metadata (matches frontend formatting)
   * @param {Array} knowledgeData - Raw knowledge entries from database
   * @returns {Array} Formatted knowledge strings
   */
  formatKnowledgeEntries(knowledgeData) {
    if (!knowledgeData || knowledgeData.length === 0) {
      return [];
    }

    return knowledgeData.map(entry => {
      return `## ${entry.title}\n${entry.content}`;
    });
  }

  /**
   * Format saved texts with rich metadata (matches frontend formatting)
   * @param {Array} textData - Raw text entries from database
   * @returns {Array} Formatted text strings
   */
  formatSavedTexts(textData) {
    if (!textData || textData.length === 0) {
      return [];
    }

    const typeDisplayNames = {
      'antrag': 'Antrag',
      'social': 'Social Media',
      'universal': 'Universal',
      'press': 'Pressemitteilung',
      'gruene_jugend': 'Grüne Jugend',
      'text': 'Allgemeiner Text'
    };

    return textData.map(text => {
      const textType = text.document_type || 'text';
      const typeDisplayName = typeDisplayNames[textType] || textType;

      // Strip HTML tags from content
      const plainContent = (text.content || '').replace(/<[^>]*>/g, '').trim();

      // Format created date in German locale
      const createdDate = text.created_at
        ? new Date(text.created_at).toLocaleDateString('de-DE')
        : 'Unbekannt';

      return `## Text: ${text.title}\n**Typ:** ${typeDisplayName}\n**Wörter:** ${text.word_count || 'Unbekannt'}\n**Erstellt:** ${createdDate}\n\n${plainContent}`;
    });
  }

  /**
   * Format vector search results with detailed metadata (matches frontend formatting)
   * @param {Array} searchResults - Vector search results from API
   * @returns {Array} Formatted document strings
   */
  formatVectorSearchResults(searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return [];
    }

    return searchResults.map(doc => {
      const contentType = doc.content_type === 'vector_search' ? 'Vector Search' :
                        doc.content_type === 'full_text' ? 'Volltext' : 'Intelligenter Auszug';

      return `## Dokument: ${doc.title}\n**Datei:** ${doc.filename}\n**Seiten:** ${doc.page_count || 'Unbekannt'}\n**Inhalt:** ${contentType}\n**Info:** ${doc.search_info}\n\n${doc.content}`;
    });
  }

  /**
   * Format full documents retrieved from Qdrant chunks
   * @param {Array} fullTextResults - Full text results from getMultipleDocumentsFullText
   * @param {Array} docsMetadata - Document metadata from PostgreSQL
   * @returns {Array} Formatted document strings
   */
  formatFullDocuments(fullTextResults, docsMetadata) {
    if (!fullTextResults || fullTextResults.length === 0) {
      return [];
    }

    return fullTextResults.map(result => {
      const meta = docsMetadata.find(d => d.id === result.id);
      if (!meta) {
        console.warn(`[RequestEnricher] Metadata not found for document ${result.id}`);
        return null;
      }

      // Estimate page count (roughly 2.5 chunks per page)
      const estimatedPages = Math.ceil(result.chunkCount / 2.5);

      // Calculate word count for better context understanding
      const wordCount = result.fullText.split(/\s+/).filter(w => w.length > 0).length;

      return `## Dokument: ${meta.title}\n**Datei:** ${meta.filename || 'Unbekannt'}\n**Seiten:** ~${estimatedPages}\n**Wörter:** ~${wordCount}\n**Inhalt:** Volltext (${result.chunkCount} Abschnitte)\n**Info:** Dokument vollständig übermittelt - ${result.chunkCount} Chunks zusammengefügt\n\n${result.fullText}`;
    }).filter(Boolean);
  }

  /**
   * Main enrichment method that orchestrates all content enrichment
   * @param {Object} requestBody - Original request from route
   * @param {Object} options - Enrichment options
   * @param {Object} req - Express request object (for locale extraction)
   * @returns {Object} Enriched state ready for prompt assembly
   */
  async enrichRequest(requestBody, options = {}, req = null) {
    const {
      type = 'universal',
      enableUrls = true,
      enableWebSearch = false,
      enableDocQnA = true,
      usePrivacyMode = false,
      webSearchQuery = null,
      systemRole = null,
      constraints = null,
      formatting = null,
      taskInstructions = null,
      outputFormat = null,
      examples = [],
      toolInstructions = [],
      // New options for content selection
      knowledgeContent = null,
      selectedDocumentIds = [],
      selectedTextIds = [],
      searchQuery = null
    } = options;

    // Extract user locale for localization
    const userLocale = req ? extractLocaleFromRequest(req) : 'de-DE';
    console.log(`🎯 [RequestEnricher] Starting enrichment (type=${type}, urls=${enableUrls}, search=${enableWebSearch}, privacy=${usePrivacyMode}, vectorSearch=${selectedDocumentIds.length > 0}, locale=${userLocale})`);

    // Initialize state with content selection and locale
    const state = {
      type,
      provider: options.provider,
      locale: userLocale,
      systemRole,
      constraints,
      formatting,
      taskInstructions,
      outputFormat,
      documents: [],
      knowledge: knowledgeContent ? [knowledgeContent] : [],
      instructions: options.instructions || null,
      request: requestBody,
      examples,
      toolInstructions: [...toolInstructions],
      // Store content selection IDs for vector search
      selectedDocumentIds,
      selectedTextIds,
      searchQuery
    };

    // Check if document knowledge was already processed (from chat route)
    if (requestBody.documentKnowledge) {
      console.log('🎯 [RequestEnricher] Using pre-processed document knowledge from chat');
      state.knowledge.push(requestBody.documentKnowledge);
      state.enrichmentMetadata = {
        ...state.enrichmentMetadata,
        documentsPreProcessed: true
      };
      // Skip attachment processing since documents were already handled
    } else {
      // Process attachments (normal flow for non-chat routes)
      const attachmentResult = await this.processRequestAttachments(
        requestBody.attachments,
        usePrivacyMode,
        type,
        requestBody.userId || 'unknown'
      );

      if (attachmentResult.error) {
        throw new Error(`Attachment processing failed: ${attachmentResult.error}`);
      }

      if (attachmentResult.documents) {
        state.documents = [...attachmentResult.documents];
      }
    }

    // Prepare parallel enrichment tasks
    const enrichmentTasks = [];

    // URL detection and crawling (if enabled and not in privacy mode)
    if (enableUrls && !usePrivacyMode) {
      enrichmentTasks.push(
        this.detectAndCrawlUrls(requestBody, state.documents)
          .then(docs => ({ type: 'urls', documents: docs }))
          .catch(error => {
            console.log('🎯 [RequestEnricher] URL enrichment failed:', error.message);
            return { type: 'urls', documents: [] };
          })
      );
    }

    // Web search enrichment (if enabled)
    if (enableWebSearch && webSearchQuery) {
      enrichmentTasks.push(
        this.performWebSearch(webSearchQuery, options.aiWorkerPool, options.req)
          .then(result => ({ type: 'websearch', knowledge: result.knowledge, sources: result.sources }))
          .catch(error => {
            console.log('🎯 [RequestEnricher] Web search failed:', error.message);
            return { type: 'websearch', knowledge: [], sources: null };
          })
      );
    }

    // KnowledgeSelector document vector search (if documents selected)
    if (selectedDocumentIds.length > 0 && searchQuery && !usePrivacyMode) {
      enrichmentTasks.push(
        this.performDocumentVectorSearch(selectedDocumentIds, searchQuery, options.req)
          .then(result => ({ type: 'vectorsearch', knowledge: result.knowledge }))
          .catch(error => {
            console.log('🎯 [RequestEnricher] Vector search failed:', error.message);
            return { type: 'vectorsearch', knowledge: [] };
          })
      );
    }

    // Fetch saved texts by IDs (if texts selected)
    if (selectedTextIds.length > 0) {
      enrichmentTasks.push(
        this.fetchTextsByIds(selectedTextIds, options.req)
          .then(result => ({ type: 'texts', knowledge: result.knowledge }))
          .catch(error => {
            console.log('🎯 [RequestEnricher] Texts fetch failed:', error.message);
            return { type: 'texts', knowledge: [] };
          })
      );
    }

    // Execute all enrichment tasks in parallel
    let enrichmentResults = [];
    if (enrichmentTasks.length > 0) {
      console.log(`🎯 [RequestEnricher] Running ${enrichmentTasks.length} enrichment tasks in parallel`);
      const results = await Promise.allSettled(enrichmentTasks);
      enrichmentResults = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
    }

    // Aggregate results
    let totalDocuments = 0;
    let webSearchSources = null;

    for (const result of enrichmentResults) {
      if (result.type === 'urls' && result.documents.length > 0) {
        state.documents.push(...result.documents);
        totalDocuments += result.documents.length;
        console.log(`🎯 [RequestEnricher] Added ${result.documents.length} URL documents`);
      } else if (result.type === 'websearch') {
        if (result.knowledge.length > 0) {
          state.knowledge.push(...result.knowledge);
          console.log(`🎯 [RequestEnricher] Added web search knowledge`);
        }
        webSearchSources = result.sources;
        if (result.knowledge.length > 0) {
          state.toolInstructions.push('Hinweis: Aktuelle Informationen aus einer Websuche sind als Hintergrundwissen verfügbar. Du kannst diese bei Bedarf nutzen.');
        }
      } else if (result.type === 'vectorsearch') {
        if (result.knowledge.length > 0) {
          state.knowledge.push(...result.knowledge);
          console.log(`🎯 [RequestEnricher] Added vector search knowledge from ${selectedDocumentIds.length} documents`);
        }
      } else if (result.type === 'knowledge') {
        if (result.knowledge.length > 0) {
          state.knowledge.push(...result.knowledge);
          console.log(`🎯 [RequestEnricher] Added ${result.knowledge.length} knowledge entries`);
        }
      } else if (result.type === 'texts') {
        if (result.knowledge.length > 0) {
          state.knowledge.push(...result.knowledge);
          console.log(`🎯 [RequestEnricher] Added ${result.knowledge.length} saved texts`);
        }
      }
    }

    // Add metadata for final processing
    state.enrichmentMetadata = {
      totalDocuments: state.documents.length,
      enableDocQnA: enableDocQnA && state.documents.length > 0 && !usePrivacyMode,
      webSearchSources,
      usePrivacyMode
    };

    console.log(`🎯 [RequestEnricher] Enrichment complete (documents=${state.documents.length}, knowledge=${state.knowledge.length})`);

    return state;
  }

  /**
   * Process attachments using existing attachment utilities
   */
  async processRequestAttachments(attachments, usePrivacyMode, routeName, userId) {
    try {
      return await processAndBuildAttachments(attachments, usePrivacyMode, routeName, userId);
    } catch (error) {
      return { error: error.message, documents: [] };
    }
  }

  /**
   * Detect URLs in request and crawl them
   */
  async detectAndCrawlUrls(requestBody, existingDocuments = []) {
    if (!urlCrawlerService) {
      console.log('🎯 [RequestEnricher] URL crawling skipped: service not available');
      return [];
    }

    try {
      // Extract URLs from request content
      const detectedUrls = extractUrlsFromContent(requestBody);

      if (detectedUrls.length === 0) {
        return [];
      }

      // Filter out URLs that are already in existing documents
      const newUrls = filterNewUrls(detectedUrls, existingDocuments);

      if (newUrls.length === 0) {
        console.log(`🎯 [RequestEnricher] Found ${detectedUrls.length} URLs but all already processed`);
        return [];
      }

      console.log(`🎯 [RequestEnricher] Processing ${newUrls.length} new URLs: ${newUrls.map(url => getUrlDomain(url)).join(', ')}`);

      // Crawl URLs with concurrency limit
      const urlsToProcess = newUrls.slice(0, this.maxConcurrentUrls);

      const crawlPromises = urlsToProcess.map(async (url) => {
        try {
          console.log(`🎯 [RequestEnricher] Crawling: ${url}`);
          const result = await urlCrawlerService.crawlUrl(url, {
            enhancedMetadata: true,
            timeout: this.urlCrawlTimeout
          });

          if (result.success) {
            const crawledDocument = {
              type: 'text',
              source: {
                text: result.data.content || result.data.markdownContent,
                metadata: {
                  title: result.data.title || `Content from ${getUrlDomain(url)}`,
                  url: result.data.originalUrl,
                  wordCount: result.data.wordCount,
                  extractedAt: result.data.extractedAt,
                  contentSource: 'url_crawl'
                }
              }
            };

            console.log(`🎯 [RequestEnricher] Successfully crawled: ${url} (${result.data.wordCount || 0} words)`);
            return crawledDocument;
          } else {
            console.log(`🎯 [RequestEnricher] Failed to crawl: ${url} - ${result.error}`);
            return null;
          }
        } catch (error) {
          console.log(`🎯 [RequestEnricher] Error crawling ${url}:`, error.message);
          return null;
        }
      });

      const results = await Promise.allSettled(crawlPromises);
      const crawledDocuments = results
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);

      if (crawledDocuments.length > 0) {
        console.log(`🎯 [RequestEnricher] Successfully crawled ${crawledDocuments.length}/${urlsToProcess.length} URLs`);
      }

      return crawledDocuments;

    } catch (error) {
      console.log('🎯 [RequestEnricher] URL detection failed:', error.message || error);
      return [];
    }
  }

  /**
   * Perform web search and generate summary
   */
  async performWebSearch(searchQuery, aiWorkerPool, req) {
    if (!searxngWebSearchService) {
      console.log('🎯 [RequestEnricher] Web search skipped: service not available');
      return { knowledge: [], sources: null };
    }

    try {
      console.log(`🎯 [RequestEnricher] Performing web search: "${searchQuery}"`);

      const searchResults = await searxngWebSearchService.performWebSearch(searchQuery, 'content');

      if (!searchResults?.success) {
        console.log('🎯 [RequestEnricher] Web search failed');
        return { knowledge: [], sources: null };
      }

      const knowledge = [];
      let sources = null;

      // Try to generate AI summary
      try {
        if (aiWorkerPool) {
          // Add small delay to allow connection cleanup before next AI request
          await new Promise(resolve => setTimeout(resolve, 500));

          const summary = await searxngWebSearchService.generateAISummary(
            searchResults,
            searchQuery,
            aiWorkerPool,
            {},
            req
          );

          if (summary?.summary?.generated && summary.summary.text) {
            knowledge.push(`HINTERGRUNDWISSEN (Websuche):\n${summary.summary.text.trim()}`);
          }
        }
      } catch (summaryError) {
        console.log('🎯 [RequestEnricher] AI summary failed:', summaryError.message);
      }

      // Extract source list for frontend
      if (Array.isArray(searchResults.results)) {
        sources = searchResults.results.slice(0, 10).map(r => ({
          title: r.title,
          url: r.url,
          domain: r.domain
        }));
      }

      console.log(`🎯 [RequestEnricher] Web search complete (knowledge=${knowledge.length > 0 ? 'yes' : 'no'}, sources=${sources?.length || 0})`);

      return { knowledge, sources };

    } catch (error) {
      console.log('🎯 [RequestEnricher] Web search error:', error.message);
      return { knowledge: [], sources: null };
    }
  }

  /**
   * Perform intelligent document retrieval using full text or vector search
   * Automatically decides based on document size (vector_count)
   */
  async performDocumentVectorSearch(selectedDocumentIds, searchQuery, req) {
    if (!selectedDocumentIds || selectedDocumentIds.length === 0 || !searchQuery) {
      console.log('🎯 [RequestEnricher] Document search skipped: no documents or query');
      return { knowledge: [] };
    }

    const startTime = Date.now();
    const userId = req?.user?.id;

    if (!userId) {
      console.log('🎯 [RequestEnricher] Document search skipped: no user ID');
      return { knowledge: [] };
    }

    try {
      console.log(`🎯 [RequestEnricher] Smart document retrieval for ${selectedDocumentIds.length} documents: "${searchQuery}"`);

      // Step 1: Fetch metadata from PostgreSQL to determine document sizes
      const { getPostgresInstance } = await import('../database/services/PostgresService.js');
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      const documentsMetadata = await Promise.all(
        selectedDocumentIds.map(async (docId) => {
          try {
            const doc = await postgres.queryOne(
              'SELECT id, title, filename, vector_count, file_size FROM documents WHERE id = $1 AND user_id = $2',
              [docId, userId],
              { table: 'documents' }
            );
            return doc;
          } catch (error) {
            console.warn(`🎯 [RequestEnricher] Failed to fetch metadata for document ${docId}:`, error.message);
            return null;
          }
        })
      );

      const validDocs = documentsMetadata.filter(Boolean);

      if (validDocs.length === 0) {
        console.log('🎯 [RequestEnricher] No accessible documents found');
        return { knowledge: [] };
      }

      // Step 2: Classify documents by size (threshold: 13 chunks ~= 5000 tokens)
      const CHUNK_THRESHOLD = 13;
      const smallDocs = validDocs.filter(doc => (doc.vector_count || 0) <= CHUNK_THRESHOLD);
      const largeDocs = validDocs.filter(doc => (doc.vector_count || 0) > CHUNK_THRESHOLD);

      console.log(`🎯 [RequestEnricher] Document classification: ${smallDocs.length} small (full text), ${largeDocs.length} large (vector search)`);

      // Step 3: Process in parallel
      const documentSearchService = getQdrantDocumentService();

      const [fullTextResults, vectorSearchResults] = await Promise.all([
        // Small documents: fetch full text from Qdrant
        smallDocs.length > 0
          ? documentSearchService.getMultipleDocumentsFullText(userId, smallDocs.map(d => d.id))
              .catch(error => {
                console.warn('🎯 [RequestEnricher] Full text retrieval failed:', error.message);
                return { documents: [], errors: [] };
              })
          : Promise.resolve({ documents: [], errors: [] }),

        // Large documents: use vector search
        largeDocs.length > 0
          ? fetch('http://localhost:3001/api/documents/search-content', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(req?.headers?.cookie && { 'Cookie': req.headers.cookie }),
                ...(req?.headers?.authorization && { 'Authorization': req.headers.authorization })
              },
              body: JSON.stringify({
                query: searchQuery.trim(),
                documentIds: largeDocs.map(d => d.id),
                limit: 5,
                mode: 'hybrid'
              })
            })
              .then(res => res.ok ? res.json() : { success: false, results: [] })
              .then(result => result.success ? result.results : [])
              .catch(error => {
                console.warn('🎯 [RequestEnricher] Vector search failed:', error.message);
                return [];
              })
          : Promise.resolve([])
      ]);

      // Step 4: Format results consistently
      const fullDocsFormatted = this.formatFullDocuments(fullTextResults.documents, smallDocs);
      const vectorDocsFormatted = this.formatVectorSearchResults(vectorSearchResults);

      // Step 5: Merge results
      const allKnowledge = [...fullDocsFormatted, ...vectorDocsFormatted];

      const elapsedTime = Date.now() - startTime;

      // Enhanced logging with performance metrics
      console.log(`🎯 [RequestEnricher] Smart retrieval complete (${elapsedTime}ms):`);
      console.log(`   - Full text: ${fullTextResults.documents.length} docs, ${fullTextResults.errors.length} errors`);
      console.log(`   - Vector search: ${vectorSearchResults.length} excerpts`);
      console.log(`   - Total knowledge entries: ${allKnowledge.length}`);
      console.log(`   - Estimated tokens saved: ~${smallDocs.length * 200} (no vector search overhead)`);

      return { knowledge: allKnowledge };

    } catch (error) {
      console.error('🎯 [RequestEnricher] Smart document retrieval error:', error);
      return { knowledge: [] };
    }
  }

  /**
   * Fetch knowledge entries by IDs from the database
   */
  async fetchKnowledgeByIds(knowledgeIds, req) {
    if (!knowledgeIds || knowledgeIds.length === 0) {
      console.log('🎯 [RequestEnricher] Knowledge fetch skipped: no IDs provided');
      return { knowledge: [] };
    }

    try {
      console.log(`🎯 [RequestEnricher] Fetching ${knowledgeIds.length} knowledge entries by IDs`);

      // Get database instance
      const { getPostgresInstance } = await import('../database/services/PostgresService.js');
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Fetch knowledge entries from user_knowledge table
      const knowledgeData = await postgres.query(
        'SELECT id, title, content FROM user_knowledge WHERE id = ANY($1) AND is_active = true',
        [knowledgeIds],
        { table: 'user_knowledge' }
      );

      if (!knowledgeData || knowledgeData.length === 0) {
        console.log('🎯 [RequestEnricher] No knowledge entries found for provided IDs');
        return { knowledge: [] };
      }

      // Format as knowledge content using new formatter
      const knowledgeEntries = this.formatKnowledgeEntries(knowledgeData);

      console.log(`🎯 [RequestEnricher] Successfully fetched ${knowledgeEntries.length} knowledge entries`);

      return { knowledge: knowledgeEntries };

    } catch (error) {
      console.log('🎯 [RequestEnricher] Knowledge fetch error:', error.message);
      return { knowledge: [] };
    }
  }

  /**
   * Fetch saved texts by IDs from the database
   */
  async fetchTextsByIds(textIds, req) {
    if (!textIds || textIds.length === 0) {
      console.log('🎯 [RequestEnricher] Texts fetch skipped: no IDs provided');
      return { knowledge: [] };
    }

    try {
      console.log(`🎯 [RequestEnricher] Fetching ${textIds.length} saved texts by IDs`);

      // Get database instance
      const { getPostgresInstance } = await import('../database/services/PostgresService.js');
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();

      // Fetch texts from user_documents table with additional metadata
      const textData = await postgres.query(
        'SELECT id, title, content, document_type, word_count, created_at FROM user_documents WHERE id = ANY($1) AND is_active = true',
        [textIds],
        { table: 'user_documents' }
      );

      if (!textData || textData.length === 0) {
        console.log('🎯 [RequestEnricher] No texts found for provided IDs');
        return { knowledge: [] };
      }

      // Format as knowledge content using new formatter
      const textEntries = this.formatSavedTexts(textData);

      console.log(`🎯 [RequestEnricher] Successfully fetched ${textEntries.length} saved texts`);

      return { knowledge: textEntries };

    } catch (error) {
      console.log('🎯 [RequestEnricher] Texts fetch error:', error.message);
      return { knowledge: [] };
    }
  }
}

/**
 * Main export function for routes
 * @param {Object} requestBody - Request body from route
 * @param {Object} options - Enrichment options
 * @param {Object} req - Express request object (for locale extraction)
 * @returns {Object} Enriched state ready for prompt assembly
 */
async function enrichRequest(requestBody, options = {}, req = null) {
  const enricher = new RequestEnricher();
  return await enricher.enrichRequest(requestBody, options, req);
}

module.exports = {
  enrichRequest,
  RequestEnricher
};