/**
 * Unified Request Enrichment Service
 * Centralizes all content enrichment logic for route optimization
 * Handles URL detection, attachment processing, web search, and document aggregation
 */

import { processAndBuildAttachments } from '../services/attachments/index.js';
import { extractUrlsFromContent, filterNewUrls, getUrlDomain } from '../services/content/index.js';
import { extractLocaleFromRequest } from '../services/localization/index.js';
import { type SearxngAIWorkerPool } from '../services/search/index.js';

import { getErrorMessage } from './errors/index.js';

import type {
  EnrichmentOptions,
  EnrichedState,
  Document,
  WebSearchResult,
  DocumentSearchResult,
  AttachmentProcessingResult,
  KnowledgeEntry,
  SavedText,
  VectorSearchResult,
  FullTextResult,
  EnrichmentTaskResult,
  TextReference,
  DocumentReference,
  WebSearchSource,
} from './types/requestEnrichment.js';
import type { RequestWithLocale } from '../services/localization/types.js';

// Lazy import to avoid circular dependency issues
const getQdrantDocumentService = async () => {
  const mod = await import('../services/document-services/DocumentSearchService/index.js');
  return mod.getQdrantDocumentService();
};

const getUrlCrawlerService = async () => {
  try {
    const mod = await import('../services/scrapers/implementations/UrlCrawler/index.js');
    return mod.urlCrawlerService;
  } catch (_) {
    return null;
  }
};

const getSearxngWebSearchService = async () => {
  try {
    const mod = await import('../services/search/index.js');
    return mod.searxngService;
  } catch (_) {
    return null;
  }
};

/**
 * Main request enrichment class
 */
class RequestEnricher {
  private maxConcurrentUrls: number;
  private urlCrawlTimeout: number;

  constructor() {
    this.maxConcurrentUrls = 5;
    this.urlCrawlTimeout = 15000;
  }

  /**
   * Format knowledge entries with detailed metadata (matches frontend formatting)
   * @param {Array} knowledgeData - Raw knowledge entries from database
   * @returns {Array} Formatted knowledge strings
   */
  formatKnowledgeEntries(knowledgeData: KnowledgeEntry[]): string[] {
    if (!knowledgeData || knowledgeData.length === 0) {
      return [];
    }

    return knowledgeData.map((entry) => {
      return `## ${entry.title}\n${entry.content}`;
    });
  }

  /**
   * Format saved texts with rich metadata (matches frontend formatting)
   * @param {Array} textData - Raw text entries from database
   * @returns {Object} Formatted text strings and reference metadata
   */
  formatSavedTexts(textData: SavedText[]): {
    formatted: string[];
    references: TextReference[];
  } {
    if (!textData || textData.length === 0) {
      return { formatted: [], references: [] };
    }

    const typeDisplayNames: Record<string, string> = {
      antrag: 'Antrag',
      social: 'Social Media',
      universal: 'Universal',
      press: 'Pressemitteilung',
      text: 'Allgemeiner Text',
    };

    const formatted: string[] = [];
    const references: TextReference[] = [];

    textData.forEach((text) => {
      const textType = text.document_type || 'text';
      const typeDisplayName = typeDisplayNames[textType] || textType;

      // Strip HTML tags from content
      const plainContent = (text.content || '').replace(/<[^>]*>/g, '').trim();

      // Format created date in German locale
      const createdDate = text.created_at
        ? new Date(text.created_at).toLocaleDateString('de-DE')
        : 'Unbekannt';

      // Add formatted string for AI knowledge array
      formatted.push(
        `## Text: ${text.title}\n**Typ:** ${typeDisplayName}\n**Wörter:** ${text.word_count || 'Unbekannt'}\n**Erstellt:** ${createdDate}\n\n${plainContent}`
      );

      // Add reference metadata for bibliography display
      references.push({
        title: text.title || 'Unbekannt',
        type: typeDisplayName,
        wordCount: text.word_count || 0,
        createdAt: createdDate,
      });
    });

    return { formatted, references };
  }

  /**
   * Format vector search results with detailed metadata (matches frontend formatting)
   * @param {Array} searchResults - Vector search results from API
   * @returns {Object} Formatted document strings and reference metadata
   */
  formatVectorSearchResults(searchResults: VectorSearchResult[]): {
    formatted: string[];
    references: DocumentReference[];
  } {
    if (!searchResults || searchResults.length === 0) {
      return { formatted: [], references: [] };
    }

    const formatted: string[] = [];
    const references: DocumentReference[] = [];

    searchResults.forEach((doc) => {
      const contentType =
        doc.content_type === 'vector_search'
          ? 'Vector Search'
          : doc.content_type === 'full_text'
            ? 'Volltext'
            : 'Intelligenter Auszug';

      // Add formatted string for AI knowledge array
      formatted.push(
        `## Dokument: ${doc.title}\n**Datei:** ${doc.filename}\n**Seiten:** ${doc.page_count || 'Unbekannt'}\n**Inhalt:** ${contentType}\n**Info:** ${doc.search_info}\n\n${doc.content}`
      );

      // Add reference metadata for bibliography display
      references.push({
        title: doc.title,
        filename: doc.filename,
        pageCount: doc.page_count,
        retrievalMethod: 'vector_search',
        relevance: doc.similarity_score ? Math.round(doc.similarity_score * 100) : undefined,
      });
    });

    return { formatted, references };
  }

  /**
   * Format full documents retrieved from Qdrant chunks
   * @param {Array} fullTextResults - Full text results from getMultipleDocumentsFullText
   * @param {Array} docsMetadata - Document metadata from PostgreSQL
   * @returns {Object} Formatted document strings and reference metadata
   */
  formatFullDocuments(
    fullTextResults: FullTextResult[],
    docsMetadata: Array<{ id: string; title?: string; filename?: string }>
  ): {
    formatted: string[];
    references: DocumentReference[];
  } {
    if (!fullTextResults || fullTextResults.length === 0) {
      return { formatted: [], references: [] };
    }

    const formatted: string[] = [];
    const references: DocumentReference[] = [];

    fullTextResults.forEach((result) => {
      const meta = docsMetadata.find((d) => d.id === result.id);
      if (!meta) {
        console.warn(`[RequestEnricher] Metadata not found for document ${result.id}`);
        return;
      }

      // Estimate page count (roughly 2.5 chunks per page)
      const estimatedPages = Math.ceil(result.chunkCount / 2.5);

      // Calculate word count for better context understanding
      const wordCount = result.fullText.split(/\s+/).filter((w) => w.length > 0).length;

      // Add formatted string for AI knowledge array
      formatted.push(
        `## Dokument: ${meta.title}\n**Datei:** ${meta.filename || 'Unbekannt'}\n**Seiten:** ~${estimatedPages}\n**Wörter:** ~${wordCount}\n**Inhalt:** Volltext (${result.chunkCount} Abschnitte)\n**Info:** Dokument vollständig übermittelt - ${result.chunkCount} Chunks zusammengefügt\n\n${result.fullText}`
      );

      // Add reference metadata for bibliography display
      references.push({
        title: meta.title || 'Unbekannt',
        filename: meta.filename || 'Unbekannt',
        pageCount: estimatedPages,
        retrievalMethod: 'full_text',
      });
    });

    return { formatted, references };
  }

  /**
   * Generate a fast preliminary answer using a quick model
   * Used to provide initial context/draft for the main generation
   * Runs in parallel with other enrichments (no context dependencies)
   * @param {Object} requestData - Original request data
   * @param {Partial<EnrichmentOptions>} options - Enrichment options
   * @returns {Object|null} { preAnswer: string, timeMs: number } or null if disabled/failed
   */
  async generateNotebookEnrich(
    requestData: Record<string, unknown>,
    options: Partial<EnrichmentOptions>
  ): Promise<{ preAnswer: string; timeMs: number } | null> {
    if (!options.enableNotebookEnrich || !options.aiWorkerPool) {
      return null;
    }

    const startTime = Date.now();

    // Build minimal context from request
    const theme = (requestData.thema ||
      requestData.theme ||
      requestData.details ||
      requestData.inhalt ||
      '') as string;
    const platforms =
      (Array.isArray(requestData.platforms) ? requestData.platforms.join(', ') : '') || '';
    const requestType = (requestData.requestType || options.type || '') as string;

    if (!theme.trim()) {
      console.log('🎯 [NotebookEnrich] Skipped: no theme/content found in request');
      return null;
    }

    const systemPrompt = `Du bist ein schneller Entwurfsassistent. Erstelle eine kurze, prägnante Vorlage als Ausgangspunkt für einen längeren Text. Fokussiere dich auf die Kernaussage und Struktur.`;

    const userPrompt =
      options.notebookEnrichPrompt ||
      `Thema: ${theme}\n${platforms ? `Plattformen: ${platforms}\n` : ''}${requestType ? `Texttyp: ${requestType}\n` : ''}Erstelle einen kurzen Entwurf (max 200 Wörter) als Grundlage für eine ausführlichere Ausarbeitung.`;

    try {
      console.log(
        `🎯 [NotebookEnrich] Generating preliminary draft for: "${theme.substring(0, 50)}..."`
      );

      const result = await options.aiWorkerPool.processRequest({
        type: 'notebook_enrich',
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        options: { max_tokens: 500, temperature: 0.4, top_p: 0.9 },
      });

      const content = result.content || '';
      if (!content || content.length < 20) {
        console.log('🎯 [NotebookEnrich] Result too short or empty, skipping');
        return null;
      }

      const timeMs = Date.now() - startTime;
      console.log(`🎯 [NotebookEnrich] Generated (${timeMs}ms, ${content.length} chars)`);

      return {
        preAnswer: content,
        timeMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[NotebookEnrich] Failed:', errorMessage);
      return null;
    }
  }

  /**
   * Main enrichment method that orchestrates all content enrichment
   * @param {Object} requestBody - Original request from route
   * @param {Object} options - Enrichment options
   * @param {Object} req - Express request object (for locale extraction)
   * @returns {Object} Enriched state ready for prompt assembly
   */
  async enrichRequest(
    requestBody: Record<string, unknown>,
    options: Partial<EnrichmentOptions> = {},
    req: unknown = null
  ): Promise<EnrichedState> {
    const {
      type = 'universal',
      enableUrls = true,
      enableWebSearch = false,
      enableDocQnA = true,
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
      searchQuery = null,
      enableNotebookEnrich = false,
      notebookEnrichPrompt: _notebookEnrichPrompt,
    } = options;

    // Extract user locale for localization
    const userLocale = req ? extractLocaleFromRequest(req as RequestWithLocale) : 'de-DE';
    console.log(
      `🎯 [RequestEnricher] Starting enrichment (type=${type}, urls=${enableUrls}, search=${enableWebSearch}, vectorSearch=${selectedDocumentIds.length > 0}, locale=${userLocale})`
    );

    // Initialize state with content selection and locale
    const state: EnrichedState = {
      type,
      provider: options.provider,
      locale: userLocale,
      systemRole,
      constraints,
      formatting,
      taskInstructions,
      outputFormat,
      documents: [] as Document[],
      knowledge: knowledgeContent ? [knowledgeContent] : [],
      instructions: options.instructions || null,
      request: requestBody,
      examples,
      toolInstructions: [...toolInstructions],
      // Store content selection IDs for vector search
      selectedDocumentIds,
      selectedTextIds,
      searchQuery,
      // Initialize enrichment metadata
      enrichmentMetadata: undefined,
    };

    // Check if document knowledge was already processed (from chat route)
    if (requestBody.documentKnowledge) {
      console.log('🎯 [RequestEnricher] Using pre-processed document knowledge from chat');
      state.knowledge.push(requestBody.documentKnowledge as string);
      // Mark that documents were pre-processed - full metadata will be set at the end
      (state as { _documentsPreProcessed?: boolean })._documentsPreProcessed = true;
      // Skip attachment processing since documents were already handled
    } else {
      // Process attachments (normal flow for non-chat routes)
      const attachmentResult = await this.processRequestAttachments(
        requestBody.attachments,
        type,
        (requestBody.userId as string) || 'unknown'
      );

      if (attachmentResult.error) {
        throw new Error(`Attachment processing failed: ${attachmentResult.error}`);
      }

      if (attachmentResult.documents) {
        state.documents = [...attachmentResult.documents];
      }
    }

    // Prepare parallel enrichment tasks
    const enrichmentTasks: Promise<EnrichmentTaskResult>[] = [];

    // URL detection and crawling (if enabled)
    if (enableUrls) {
      enrichmentTasks.push(
        this.detectAndCrawlUrls(requestBody, state.documents)
          .then((docs) => ({ type: 'urls' as const, documents: docs }))
          .catch((error: unknown) => {
            console.log('🎯 [RequestEnricher] URL enrichment failed:', getErrorMessage(error));
            return { type: 'urls' as const, documents: [] as Document[] };
          })
      );
    }

    // Web search enrichment (if enabled)
    if (enableWebSearch && webSearchQuery) {
      enrichmentTasks.push(
        this.performWebSearch(webSearchQuery, options.aiWorkerPool, options.req)
          .then((result) => ({
            type: 'websearch' as const,
            knowledge: result.knowledge,
            sources: result.sources,
          }))
          .catch((error: unknown) => {
            console.log('🎯 [RequestEnricher] Web search failed:', getErrorMessage(error));
            return { type: 'websearch' as const, knowledge: [] as string[], sources: null };
          })
      );
    }

    // KnowledgeSelector document vector search (if documents selected)
    if (selectedDocumentIds.length > 0 && searchQuery) {
      enrichmentTasks.push(
        this.performDocumentVectorSearch(
          selectedDocumentIds,
          searchQuery,
          options.req as {
            user?: { id: string };
            headers?: Record<string, string | string[] | undefined>;
          }
        )
          .then((result) => ({
            type: 'vectorsearch' as const,
            knowledge: result.knowledge,
            documentReferences: result.documentReferences || [],
          }))
          .catch((error: unknown) => {
            console.log('🎯 [RequestEnricher] Vector search failed:', getErrorMessage(error));
            return {
              type: 'vectorsearch' as const,
              knowledge: [] as string[],
              documentReferences: [] as DocumentReference[],
            };
          })
      );
    }

    // Fetch saved texts by IDs (if texts selected)
    if (selectedTextIds.length > 0) {
      enrichmentTasks.push(
        this.fetchTextsByIds(selectedTextIds, options.req as { user?: { id: string } })
          .then((result) => ({
            type: 'texts' as const,
            knowledge: result.knowledge,
            textReferences: result.textReferences || [],
          }))
          .catch((error: unknown) => {
            console.log('🎯 [RequestEnricher] Texts fetch failed:', getErrorMessage(error));
            return {
              type: 'texts' as const,
              knowledge: [] as string[],
              textReferences: [] as TextReference[],
            };
          })
      );
    }

    // Fast mode pre-answer (if enabled) - generates quick preliminary draft
    // Runs in parallel with other enrichments since it doesn't need their context
    if (enableNotebookEnrich) {
      enrichmentTasks.push(
        this.generateNotebookEnrich(requestBody, options)
          .then((result) => ({
            type: 'notebook_enrich' as const,
            preAnswer: result?.preAnswer ?? null,
            timeMs: result?.timeMs ?? 0,
          }))
          .catch((error: unknown) => {
            console.log('🎯 [RequestEnricher] Fast pre-answer failed:', getErrorMessage(error));
            return { type: 'notebook_enrich' as const, preAnswer: null, timeMs: 0 };
          })
      );
    }

    // Execute all enrichment tasks in parallel
    let enrichmentResults: EnrichmentTaskResult[] = [];
    if (enrichmentTasks.length > 0) {
      console.log(
        `🎯 [RequestEnricher] Running ${enrichmentTasks.length} enrichment tasks in parallel`
      );
      const results = await Promise.allSettled(enrichmentTasks);
      enrichmentResults = results
        .filter(
          (result): result is PromiseFulfilledResult<EnrichmentTaskResult> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value);
    }

    // Aggregate results
    let webSearchSources: WebSearchSource[] | null = null;
    let notebookEnrichMetadata: { preAnswer: string; timeMs: number } | null = null;
    const allDocumentReferences: DocumentReference[] = [];
    const allTextReferences: TextReference[] = [];

    for (const result of enrichmentResults) {
      if (result.type === 'urls' && result.documents.length > 0) {
        state.documents.push(...result.documents);
        console.log(`🎯 [RequestEnricher] Added ${result.documents.length} URL documents`);
      } else if (result.type === 'websearch') {
        if (result.knowledge.length > 0) {
          state.knowledge.push(...result.knowledge);
          console.log(`🎯 [RequestEnricher] Added web search knowledge`);
        }
        webSearchSources = result.sources;
        if (result.knowledge.length > 0) {
          state.toolInstructions.push(
            'Hinweis: Aktuelle Informationen aus einer Websuche sind als Hintergrundwissen verfügbar. Du kannst diese bei Bedarf nutzen.'
          );
        }
      } else if (result.type === 'vectorsearch') {
        if (result.knowledge.length > 0) {
          state.knowledge.push(...result.knowledge);
          console.log(
            `🎯 [RequestEnricher] Added vector search knowledge from ${selectedDocumentIds.length} documents`
          );
        }
        if (result.documentReferences && result.documentReferences.length > 0) {
          allDocumentReferences.push(...result.documentReferences);
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
        if (result.textReferences && result.textReferences.length > 0) {
          allTextReferences.push(...result.textReferences);
        }
      } else if (result.type === 'notebook_enrich') {
        if (result.preAnswer) {
          state.knowledge.push(
            `<vorarbeit>\nSCHNELLER VORENTWURF:\n${result.preAnswer}\n</vorarbeit>`
          );
          notebookEnrichMetadata = {
            preAnswer: result.preAnswer,
            timeMs: result.timeMs,
          };
          console.log(
            `🎯 [RequestEnricher] Added fast pre-answer (${result.timeMs}ms, ${result.preAnswer.length} chars)`
          );
          state.toolInstructions.push(
            'Hinweis: Ein schneller Vorentwurf wurde als Ausgangspunkt bereitgestellt. Du kannst diesen verfeinern, erweitern oder komplett neu formulieren.'
          );
        }
      }
    }

    // Add metadata for final processing
    state.enrichmentMetadata = {
      totalDocuments: state.documents.length,
      enableDocQnA: enableDocQnA && state.documents.length > 0,
      webSearchSources,
      documentsPreProcessed:
        (state as { _documentsPreProcessed?: boolean })._documentsPreProcessed ?? false,
      documentsReferences: allDocumentReferences.length > 0 ? allDocumentReferences : undefined,
      textsReferences: allTextReferences.length > 0 ? allTextReferences : undefined,
      notebookEnrichUsed: !!notebookEnrichMetadata,
      notebookEnrichLength: notebookEnrichMetadata?.preAnswer?.length || 0,
      notebookEnrichTimeMs: notebookEnrichMetadata?.timeMs || 0,
    };

    console.log(
      `🎯 [RequestEnricher] Enrichment complete (documents=${state.documents.length}, knowledge=${state.knowledge.length})`
    );

    return state;
  }

  /**
   * Process attachments using existing attachment utilities
   */
  async processRequestAttachments(
    attachments: unknown,
    routeName: string,
    userId?: string
  ): Promise<AttachmentProcessingResult> {
    try {
      const result = await processAndBuildAttachments(attachments, routeName, userId);
      const output: AttachmentProcessingResult = {
        hasAttachments: result.hasAttachments,
        summary: result.summary,
        validated: result.validated,
        error: result.error,
      };
      if (result.documents != null) {
        output.documents = result.documents.map((doc) => ({
          type: doc.type,
          source: {
            type: doc.source.type,
            media_type: doc.source.media_type,
            data: doc.source.data,
            text: doc.source.text,
          },
        }));
      }
      return output;
    } catch (error) {
      return { error: getErrorMessage(error) };
    }
  }

  /**
   * Detect URLs in request and crawl them
   */
  async detectAndCrawlUrls(
    requestBody: Record<string, unknown>,
    existingDocuments: Document[] = []
  ): Promise<Document[]> {
    const urlCrawler = await getUrlCrawlerService();
    if (!urlCrawler) {
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
        console.log(
          `🎯 [RequestEnricher] Found ${detectedUrls.length} URLs but all already processed`
        );
        return [];
      }

      console.log(
        `🎯 [RequestEnricher] Processing ${newUrls.length} new URLs: ${newUrls.map((url) => getUrlDomain(url)).join(', ')}`
      );

      // Crawl URLs with concurrency limit
      const urlsToProcess = newUrls.slice(0, this.maxConcurrentUrls);

      const crawlPromises = urlsToProcess.map(async (url) => {
        try {
          console.log(`🎯 [RequestEnricher] Crawling: ${url}`);
          const result = await urlCrawler.crawlUrl(url, {
            enhancedMetadata: true,
            timeout: this.urlCrawlTimeout,
          });

          if (result.success && result.data) {
            const { data } = result;
            const crawledDocument: Document = {
              type: 'text' as const,
              source: {
                type: 'text' as const,
                text: data.content || data.markdownContent,
                metadata: {
                  title: data.title || `Content from ${getUrlDomain(url)}`,
                  url: data.originalUrl,
                  wordCount: data.wordCount,
                  extractedAt: data.extractedAt,
                  contentSource: 'url_crawl' as const,
                },
              },
            };

            console.log(
              `🎯 [RequestEnricher] Successfully crawled: ${url} (${data.wordCount || 0} words)`
            );
            return crawledDocument;
          } else {
            console.log(`🎯 [RequestEnricher] Failed to crawl: ${url} - ${result.error}`);
            return null;
          }
        } catch (error) {
          console.log(`🎯 [RequestEnricher] Error crawling ${url}:`, getErrorMessage(error));
          return null;
        }
      });

      const results = await Promise.allSettled(crawlPromises);
      const crawledDocuments = results
        .filter(
          (result): result is PromiseFulfilledResult<Document | null> =>
            result.status === 'fulfilled'
        )
        .map((result) => result.value)
        .filter((doc): doc is Document => doc !== null);

      if (crawledDocuments.length > 0) {
        console.log(
          `🎯 [RequestEnricher] Successfully crawled ${crawledDocuments.length}/${urlsToProcess.length} URLs`
        );
      }

      return crawledDocuments;
    } catch (error) {
      console.log('🎯 [RequestEnricher] URL detection failed:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Perform web search and generate summary
   */
  async performWebSearch(
    searchQuery: string,
    aiWorkerPool: EnrichmentOptions['aiWorkerPool'],
    req: unknown
  ): Promise<WebSearchResult> {
    const searxngService = await getSearxngWebSearchService();
    if (!searxngService) {
      console.log('🎯 [RequestEnricher] Web search skipped: service not available');
      return { knowledge: [], sources: null };
    }

    try {
      console.log(`🎯 [RequestEnricher] Performing web search: "${searchQuery}"`);

      const searchResults = await searxngService.performWebSearch(searchQuery);

      if (!searchResults?.success) {
        console.log('🎯 [RequestEnricher] Web search failed');
        return { knowledge: [], sources: null };
      }

      const knowledge: string[] = [];
      let sources: WebSearchSource[] | null = null;

      // Try to generate AI summary
      try {
        if (aiWorkerPool) {
          const summary = await searxngService.generateAISummary(
            searchResults,
            searchQuery,
            aiWorkerPool as SearxngAIWorkerPool,
            {},
            req
          );

          if (summary?.summary?.generated && summary.summary.text) {
            knowledge.push(`HINTERGRUNDWISSEN (Websuche):\n${summary.summary.text.trim()}`);
          }
        }
      } catch (summaryError) {
        console.log('🎯 [RequestEnricher] AI summary failed:', getErrorMessage(summaryError));
      }

      // Extract source list for frontend
      if (Array.isArray(searchResults.results)) {
        sources = searchResults.results.slice(0, 10).map((r) => ({
          title: r.title,
          url: r.url,
          domain: r.domain,
        }));
      }

      console.log(
        `🎯 [RequestEnricher] Web search complete (knowledge=${knowledge.length > 0 ? 'yes' : 'no'}, sources=${sources?.length || 0})`
      );

      return { knowledge, sources };
    } catch (error) {
      console.log('🎯 [RequestEnricher] Web search error:', getErrorMessage(error));
      return { knowledge: [], sources: null };
    }
  }

  /**
   * Perform intelligent document retrieval using full text or vector search
   * Automatically decides based on document size (vector_count)
   */
  async performDocumentVectorSearch(
    selectedDocumentIds: string[],
    searchQuery: string,
    req: { user?: { id: string }; headers?: Record<string, string | string[] | undefined> }
  ): Promise<DocumentSearchResult> {
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
      console.log(
        `🎯 [RequestEnricher] Smart document retrieval for ${selectedDocumentIds.length} documents: "${searchQuery}"`
      );

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
            console.warn(
              '🎯 [RequestEnricher] Failed to fetch metadata for document %s:',
              docId,
              getErrorMessage(error)
            );
            return null;
          }
        })
      );

      const validDocs = documentsMetadata.filter(
        (doc): doc is NonNullable<typeof doc> => doc !== null && doc !== undefined
      );

      if (validDocs.length === 0) {
        console.log('🎯 [RequestEnricher] No accessible documents found');
        return { knowledge: [] };
      }

      // Step 2: Classify documents by size (threshold: 13 chunks ~= 5000 tokens)
      const CHUNK_THRESHOLD = 13;
      const smallDocs = validDocs.filter(
        (doc: { vector_count?: number }) => (doc.vector_count || 0) <= CHUNK_THRESHOLD
      );
      const largeDocs = validDocs.filter(
        (doc: { vector_count?: number }) => (doc.vector_count || 0) > CHUNK_THRESHOLD
      );

      console.log(
        `🎯 [RequestEnricher] Document classification: ${smallDocs.length} small (full text), ${largeDocs.length} large (vector search)`
      );

      // Step 3: Process in parallel
      const documentSearchService = await getQdrantDocumentService();

      const [fullTextResults, vectorSearchResults] = await Promise.all([
        // Small documents: fetch full text from Qdrant
        smallDocs.length > 0
          ? documentSearchService
              .getMultipleDocumentsFullText(
                userId,
                smallDocs.map((d) => d.id as string)
              )
              .catch((error: unknown) => {
                console.warn(
                  '🎯 [RequestEnricher] Full text retrieval failed:',
                  getErrorMessage(error)
                );
                return { documents: [], errors: [] };
              })
          : Promise.resolve({ documents: [], errors: [] }),

        // Large documents: use vector search
        largeDocs.length > 0
          ? fetch('http://localhost:3001/api/documents/search-content', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(req?.headers?.cookie && { Cookie: String(req.headers.cookie) }),
                ...(req?.headers?.authorization && {
                  Authorization: String(req.headers.authorization),
                }),
              },
              body: JSON.stringify({
                query: searchQuery.trim(),
                documentIds: largeDocs.map((d) => d.id),
                limit: 5,
                mode: 'hybrid',
              }),
            })
              .then(
                (res) =>
                  (res.ok ? res.json() : { success: false, results: [] }) as Promise<{
                    success: boolean;
                    results: VectorSearchResult[];
                  }>
              )
              .then((result) => (result.success ? result.results : []))
              .catch((error: unknown) => {
                console.warn('🎯 [RequestEnricher] Vector search failed:', getErrorMessage(error));
                return [];
              })
          : Promise.resolve([]),
      ]);

      // Step 4: Format results consistently
      const fullDocsResult = this.formatFullDocuments(
        fullTextResults.documents,
        smallDocs as Array<{ id: string; title?: string; filename?: string }>
      );
      const vectorDocsResult = this.formatVectorSearchResults(vectorSearchResults);

      // Step 5: Merge results
      const allKnowledge = [...fullDocsResult.formatted, ...vectorDocsResult.formatted];
      const allReferences = [...fullDocsResult.references, ...vectorDocsResult.references];

      const elapsedTime = Date.now() - startTime;

      // Enhanced logging with performance metrics
      console.log(`🎯 [RequestEnricher] Smart retrieval complete (${elapsedTime}ms):`);
      console.log(
        `   - Full text: ${fullTextResults.documents.length} docs, ${fullTextResults.errors.length} errors`
      );
      console.log(`   - Vector search: ${vectorSearchResults.length} excerpts`);
      console.log(`   - Total knowledge entries: ${allKnowledge.length}`);
      console.log(
        `   - Estimated tokens saved: ~${smallDocs.length * 200} (no vector search overhead)`
      );

      return { knowledge: allKnowledge, documentReferences: allReferences };
    } catch (error) {
      console.error('🎯 [RequestEnricher] Smart document retrieval error:', error);
      return { knowledge: [], documentReferences: [] };
    }
  }

  /**
   * Fetch knowledge entries by IDs from the database
   */
  async fetchKnowledgeByIds(
    knowledgeIds: string[],
    _req: { user?: { id: string } }
  ): Promise<DocumentSearchResult> {
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
      const knowledgeEntries = this.formatKnowledgeEntries(
        knowledgeData as unknown as KnowledgeEntry[]
      );

      console.log(
        `🎯 [RequestEnricher] Successfully fetched ${knowledgeEntries.length} knowledge entries`
      );

      return { knowledge: knowledgeEntries };
    } catch (error) {
      console.log('🎯 [RequestEnricher] Knowledge fetch error:', getErrorMessage(error));
      return { knowledge: [] };
    }
  }

  /**
   * Fetch saved texts by IDs from the database
   */
  async fetchTextsByIds(
    textIds: string[],
    _req: { user?: { id: string } }
  ): Promise<DocumentSearchResult> {
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
        return { knowledge: [], textReferences: [] };
      }

      // Format as knowledge content using new formatter
      const textsResult = this.formatSavedTexts(textData as unknown as SavedText[]);

      console.log(
        `🎯 [RequestEnricher] Successfully fetched ${textsResult.formatted.length} saved texts`
      );

      return { knowledge: textsResult.formatted, textReferences: textsResult.references };
    } catch (error) {
      console.log('🎯 [RequestEnricher] Texts fetch error:', getErrorMessage(error));
      return { knowledge: [], textReferences: [] };
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
async function enrichRequest(
  requestBody: unknown,
  options: Partial<EnrichmentOptions> = {},
  req: unknown = null
): Promise<EnrichedState> {
  const enricher = new RequestEnricher();
  return await enricher.enrichRequest(requestBody as Record<string, unknown>, options, req);
}

export { enrichRequest, RequestEnricher };
