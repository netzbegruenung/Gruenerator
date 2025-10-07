/**
 * Unified Request Enrichment Service
 * Centralizes all content enrichment logic for route optimization
 * Handles URL detection, attachment processing, web search, and document aggregation
 */

const { extractUrlsFromContent, filterNewUrls, getUrlDomain } = require('./urlDetection.js');
const { processAndBuildAttachments } = require('./attachmentUtils.js');
const { extractLocaleFromRequest } = require('./localizationHelper.js');

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
      // New options for KnowledgeSelector documents
      knowledgeContent = null,
      selectedKnowledgeIds = [],
      selectedDocumentIds = [],
      selectedTextIds = [],
      searchQuery = null
    } = options;

    // Extract user locale for localization
    const userLocale = req ? extractLocaleFromRequest(req) : 'de-DE';
    console.log(`🎯 [RequestEnricher] Starting enrichment (type=${type}, urls=${enableUrls}, search=${enableWebSearch}, privacy=${usePrivacyMode}, vectorSearch=${selectedDocumentIds.length > 0}, locale=${userLocale})`);

    // Initialize state with KnowledgeSelector content and locale
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
      // Store KnowledgeSelector IDs for vector search
      selectedKnowledgeIds,
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
              type: 'document',
              source: {
                type: 'text',
                text: result.data.content || result.data.markdownContent,
                title: result.data.title || `Content from ${getUrlDomain(url)}`,
                url: result.data.originalUrl,
                metadata: {
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
   * Perform vector search on KnowledgeSelector documents
   */
  async performDocumentVectorSearch(selectedDocumentIds, searchQuery, req) {
    if (!selectedDocumentIds || selectedDocumentIds.length === 0 || !searchQuery) {
      console.log('🎯 [RequestEnricher] Vector search skipped: no documents or query');
      return { knowledge: [] };
    }

    try {
      console.log(`🎯 [RequestEnricher] Performing vector search on ${selectedDocumentIds.length} documents: "${searchQuery}"`);

      // Use the existing document search API endpoint
      const response = await fetch('http://localhost:3001/api/documents/search-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Forward authentication headers from original request if available
          ...(req?.headers?.cookie && { 'Cookie': req.headers.cookie }),
          ...(req?.headers?.authorization && { 'Authorization': req.headers.authorization })
        },
        body: JSON.stringify({
          query: searchQuery.trim(),
          documentIds: selectedDocumentIds,
          limit: 5,
          mode: 'hybrid'
        })
      });

      if (!response.ok) {
        console.log(`🎯 [RequestEnricher] Vector search API failed: ${response.status}`);
        return { knowledge: [] };
      }

      const result = await response.json();

      if (!result.success || !result.results || result.results.length === 0) {
        console.log('🎯 [RequestEnricher] Vector search returned no results');
        return { knowledge: [] };
      }

      // Format results as knowledge content
      const knowledgeEntries = result.results.map(doc => {
        const contentType = doc.content_type === 'vector_search' ? 'Vector Search' :
                          doc.content_type === 'full_text' ? 'Volltext' : 'Intelligenter Auszug';

        return `DOKUMENT-WISSEN aus "${doc.title}" (${doc.filename}):\n${doc.content}`;
      });

      console.log(`🎯 [RequestEnricher] Vector search complete: ${knowledgeEntries.length} document excerpts extracted`);

      return { knowledge: knowledgeEntries };

    } catch (error) {
      console.log('🎯 [RequestEnricher] Vector search error:', error.message);
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