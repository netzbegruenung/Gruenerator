/**
 * Base Search Service - Template method pattern for search services
 *
 * Provides shared utilities and template methods for all search implementations.
 * Eliminates code duplication while allowing customization through inheritance.
 */

import { mistralEmbeddingService } from '../mistral/index.js';
import { InputValidator, ValidationError } from '../../utils/inputValidation.js';
import { createCache } from '../../utils/lruCache.js';
import { SearchError, DatabaseError, createErrorHandler } from '../../utils/errorHandling.js';
import { vectorConfig } from '../../config/vectorConfig.js';
import {
  normalizeQuery,
  containsNormalized
} from '../../utils/textNormalization.js';
import { simpleHash as hashString } from '../../utils/hashUtils.js';

import {
  looksLikeTOC,
  extractMatchedExcerpt,
  needsTrailingEllipsis,
  trimToSentenceBoundary
} from './textUtils.js';

import {
  calculateEnhancedDocumentScore,
  calculateHybridDocumentScore,
  calculateDynamicThreshold,
  calculateStaticDocumentScore,
  calculateStaticThreshold,
  applyMMRSelection
} from './scoring.js';

import type {
  SearchParams,
  ValidatedSearchParams,
  SearchFilters,
  SearchOptions,
  SearchResponse,
  RawChunk,
  ChunkData,
  TransformedChunk,
  DocumentData,
  DocumentResult,
  TopChunk,
  HybridMetadata,
  EnhancedScore,
  SimilarChunkParams,
  HybridChunkParams,
  RPCParams,
  Cache,
  ErrorHandler,
  BaseSearchServiceOptions,
  MMROptions
} from './types.js';

// Re-export SearchError for backward compatibility
export { SearchError };

/**
 * Base search service providing common search functionality
 */
export class BaseSearchService {
  serviceName: string;
  defaultLimit: number;
  defaultThreshold: number;
  maxLimit: number;
  chunkMultiplier: number;
  errorHandler: ErrorHandler;
  cache: Cache;

  constructor(options: BaseSearchServiceOptions = {}) {
    this.serviceName = options.serviceName || 'BaseSearch';

    // Use centralized configuration with option overrides
    const searchConfig = vectorConfig.get('search');
    const loggingConfig = vectorConfig.get('logging');

    this.defaultLimit = options.defaultLimit || searchConfig.defaultLimit;
    this.defaultThreshold = options.defaultThreshold || searchConfig.defaultThreshold;
    this.maxLimit = searchConfig.maxLimit;
    this.chunkMultiplier = searchConfig.chunkMultiplier;

    // Initialize error handler
    this.errorHandler = createErrorHandler(this.serviceName, {
      enableTelemetry: options.enableTelemetry !== false && loggingConfig.enableTelemetry,
      logLevel: options.logLevel || loggingConfig.level
    });

    // Initialize cache for search results
    const cacheConfig = vectorConfig.getCacheConfig((options.cacheType || 'baseService') as 'searchResults' | 'baseService');
    this.cache = createCache.general({
      name: `${this.serviceName}Cache`,
      maxSize: options.cacheSize || cacheConfig.maxSize,
      ttl: options.cacheTTL || cacheConfig.ttl
    });
  }

  /**
   * Perform vector similarity search with common logic
   */
  async performSimilaritySearch(params: SearchParams): Promise<SearchResponse> {
    try {
      // Validate and sanitize parameters
      const validatedParams = this.validateSearchParams(params);
      const { query, userId, filters, options } = validatedParams;

      console.log(`[${this.serviceName}] Performing similarity search for: "${query}"`);

      // Check cache first
      if (options.useCache) {
        const cacheKey = this.generateCacheKey(validatedParams);
        const cached = this.cache.get(cacheKey) as SearchResponse | undefined;
        if (cached) {
          console.log(`[${this.serviceName}] Cache hit for query: "${query}"`);
          return cached;
        }
      }

      // Generate query embedding
      const queryEmbedding = await this.generateQueryEmbedding(query, options);
      console.log(`[${this.serviceName}] Query embedding generated (dims=${queryEmbedding?.length || 'n/a'})`);

      // Calculate dynamic threshold
      const threshold = options.threshold ?? this.calculateDynamicThreshold(query);

      // Find similar chunks
      const chunks = await this.findSimilarChunks({
        embedding: queryEmbedding,
        userId,
        filters,
        limit: Math.round(options.limit * this.chunkMultiplier),
        threshold,
        query
      });
      console.log(`[${this.serviceName}] Retrieved ${chunks.length} chunks from vector search`);

      // Handle empty results
      if (chunks.length === 0) {
        return this.handleEmptyResults(query, options, userId);
      }

      // Group and rank results
      const results = await this.groupAndRankResults(chunks, options.limit, query);

      // Build response
      const response: SearchResponse = {
        success: true,
        results,
        query: query.trim(),
        searchType: this.getSearchType(),
        message: `Found ${results.length} relevant document(s)`,
        metadata: {
          searchService: this.serviceName,
          totalChunks: chunks.length,
          threshold,
          cached: false
        }
      };

      // Cache the result
      if (options.useCache) {
        const cacheKey = this.generateCacheKey(validatedParams);
        this.cache.set(cacheKey, response);
      }

      console.log(`[${this.serviceName}] Found ${results.length} results for: "${query}"`);
      return response;
    } catch (error) {
      return this.errorHandler.handle(error as Error, {
        operation: 'similarity_search',
        query: params.query,
        userId: params.userId,
        returnResponse: true
      });
    }
  }

  /**
   * Perform hybrid search combining vector similarity with text matching
   */
  async performHybridSearch(params: SearchParams): Promise<SearchResponse> {
    try {
      // Validate and sanitize parameters
      const validatedParams = this.validateSearchParams(params);
      const { query, userId, filters, options } = validatedParams;

      console.log(`[${this.serviceName}] Performing hybrid search for: "${query}"`);

      // Check cache first
      if (options.useCache) {
        const cacheKey = this.generateCacheKey({ ...validatedParams, searchType: 'hybrid' } as ValidatedSearchParams & { searchType: string });
        const cached = this.cache.get(cacheKey) as SearchResponse | undefined;
        if (cached) {
          console.log(`[${this.serviceName}] Cache hit for hybrid query: "${query}"`);
          return cached;
        }
      }

      // Generate query embedding for vector component
      const queryEmbedding = await this.generateQueryEmbedding(query, options);

      // Calculate dynamic threshold
      const threshold = options.threshold ?? this.calculateDynamicThreshold(query);

      // Import keyword extractor for text component
      const { keywordExtractor } = await import('./KeywordExtractor.js');
      const searchPatterns = keywordExtractor.generateSearchPatterns(query);

      // Execute hybrid search
      const chunks = await this.findHybridChunks({
        embedding: queryEmbedding,
        query,
        searchPatterns,
        userId,
        filters,
        limit: Math.round(options.limit * this.chunkMultiplier),
        threshold,
        hybridOptions: {
          vectorWeight: options.vectorWeight ?? 0.4,
          textWeight: options.textWeight ?? 0.5,
          useRRF: options.useRRF ?? false,
          rrfK: options.rrfK ?? 60,
          recallLimit: options.recallLimit
        }
      });

      // Handle empty results
      if (chunks.length === 0) {
        return this.handleEmptyResults(query, options, userId);
      }

      // Group and rank results with hybrid scoring
      const results = await this.groupAndRankHybridResults(chunks, options.limit, query, {
        applyMMR: true,
        mmrLambda: 0.7
      });

      // Build response
      const response: SearchResponse = {
        success: true,
        results,
        query: query.trim(),
        searchType: 'hybrid',
        message: `Found ${results.length} relevant document(s) using hybrid search`,
        metadata: {
          searchService: this.serviceName,
          totalChunks: chunks.length,
          threshold,
          cached: false,
          searchPatterns: searchPatterns.patterns,
          hybridMethod: options.useRRF !== false ? 'RRF' : 'weighted'
        }
      };

      // Cache the result
      if (options.useCache) {
        const cacheKey = this.generateCacheKey({ ...validatedParams, searchType: 'hybrid' } as ValidatedSearchParams & { searchType: string });
        this.cache.set(cacheKey, response);
      }

      console.log(`[${this.serviceName}] Found ${results.length} hybrid results for: "${query}"`);
      return response;
    } catch (error) {
      return this.errorHandler.handle(error as Error, {
        operation: 'hybrid_search',
        query: params.query,
        userId: params.userId,
        returnResponse: true
      });
    }
  }

  /**
   * Generate query embedding with smart expansion support
   * @protected
   */
  async generateQueryEmbedding(query: string, options: SearchOptions = {}): Promise<number[]> {
    return await mistralEmbeddingService.generateQueryEmbedding(query);
  }

  /**
   * Find similar chunks in the database
   * @protected
   */
  async findSimilarChunks(params: SimilarChunkParams): Promise<TransformedChunk[]> {
    const { embedding, userId, filters, limit, threshold } = params;

    // Validate and secure the embedding
    const embeddingString = InputValidator.validateEmbedding(embedding);

    // Choose appropriate RPC function based on filters
    const rpcFunction = this.getRPCFunction(filters);
    const rpcParams = this.buildRPCParams({
      embeddingString,
      userId,
      filters,
      limit,
      threshold
    });

    console.log(`[${this.serviceName}] Calling ${rpcFunction} with threshold: ${threshold}`);

    // Note: supabaseService is imported by subclasses that need it
    // This base implementation throws an error
    throw new DatabaseError('Base findSimilarChunks must be overridden by subclass', 'NOT_IMPLEMENTED', {
      rpcFunction,
      operation: 'similarity_search'
    });
  }

  /**
   * Group chunks by document and calculate rankings
   * @protected
   */
  async groupAndRankResults(
    chunks: TransformedChunk[],
    limit: number,
    query = ''
  ): Promise<DocumentResult[]> {
    const documentMap = new Map<string, DocumentData>();
    const normQuery = normalizeQuery(query);
    const isShortQuery = (query || '').trim().split(/\s+/).filter(Boolean).length <= 2;

    // Group chunks by document
    for (const chunk of chunks) {
      const docId = this.extractDocumentId(chunk);

      if (!documentMap.has(docId)) {
        documentMap.set(docId, {
          document_id: docId,
          title: this.extractDocumentTitle(chunk),
          filename: this.extractDocumentFilename(chunk),
          created_at: this.extractDocumentCreatedAt(chunk),
          chunks: [],
          maxSimilarity: 0,
          avgSimilarity: 0
        });
      }

      const docData = documentMap.get(docId)!;
      const chunkData = this.extractChunkData(chunk);

      // Lexical-aware adjustments per chunk
      const hasTerm = normQuery ? containsNormalized(chunkData.text, normQuery) : false;
      const isTOC = looksLikeTOC(chunkData.text);
      const inHeader = chunkData.content_type === 'heading';
      const adjusted = (chunkData.similarity || 0)
        + (hasTerm ? 0.12 : 0)
        + (hasTerm && inHeader ? 0.06 : 0)
        - (isTOC ? 0.08 : 0);

      chunkData.similarity_adjusted = adjusted;
      chunkData.has_term = hasTerm;
      chunkData.is_toc = isTOC;

      docData.chunks.push(chunkData);

      // Update max similarity
      if (chunkData.similarity > docData.maxSimilarity) {
        docData.maxSimilarity = chunkData.similarity;
      }
    }

    // Calculate enhanced scores and format results
    const results: (DocumentResult | null)[] = Array.from(documentMap.values()).map(doc => {
      // For short queries, require at least one literal match
      if (normQuery && isShortQuery && !doc.chunks.some(c => c.has_term)) {
        return null;
      }

      // Sort chunks by adjusted similarity
      doc.chunks.sort((a, b) => (b.similarity_adjusted ?? b.similarity) - (a.similarity_adjusted ?? a.similarity));

      // Calculate enhanced document score
      const enhancedScore = calculateEnhancedDocumentScore(doc.chunks);

      // Take top chunks per document
      const contentConfig = vectorConfig.get('content');
      const maxN = contentConfig.maxChunksPerDocument;
      let topChunks = doc.chunks.slice(0, maxN);

      // Ensure at least one keyword-hit chunk is present and first
      if (normQuery) {
        const idx = topChunks.findIndex(c => c.has_term);
        if (idx === -1) {
          const firstHit = doc.chunks.find(c => c.has_term);
          if (firstHit) {
            topChunks = [firstHit, ...topChunks].slice(0, maxN);
          }
        } else if (idx > 0) {
          const [hit] = topChunks.splice(idx, 1);
          topChunks.unshift(hit);
        }
      }

      // Create combined relevant text
      const relevantContent = topChunks
        .map(chunk => (normQuery && chunk.has_term)
          ? extractMatchedExcerpt(chunk.text, query, contentConfig.maxExcerptLength)
          : this.extractRelevantExcerpt(chunk.text))
        .join('\n\n---\n\n');

      return {
        document_id: doc.document_id,
        title: doc.title,
        filename: doc.filename,
        created_at: doc.created_at,
        relevant_content: relevantContent,
        similarity_score: enhancedScore.finalScore,
        max_similarity: enhancedScore.maxSimilarity,
        avg_similarity: enhancedScore.avgSimilarity,
        position_score: enhancedScore.positionScore,
        diversity_bonus: enhancedScore.diversityBonus,
        quality_avg: typeof enhancedScore.qualityAvg === 'number' ? enhancedScore.qualityAvg : null,
        chunk_index: topChunks[0]?.chunk_index ?? null,
        top_chunks: topChunks.map(tc => ({
          chunk_index: tc.chunk_index,
          content_type: tc.content_type ?? null,
          page_number: tc.page_number ?? null,
          quality_score: typeof tc.quality_score === 'number' ? tc.quality_score : null,
          has_term: !!tc.has_term,
          preview: (normQuery && tc.has_term)
            ? extractMatchedExcerpt(tc.text, query, contentConfig.maxExcerptLength)
            : this.extractRelevantExcerpt(tc.text)
        })),
        chunk_count: doc.chunks.length,
        relevance_info: this.buildRelevanceInfo(doc, enhancedScore)
      };
    });

    // Remove filtered docs, sort, and limit
    const filtered = results.filter((r): r is DocumentResult => r !== null);
    filtered.sort((a, b) => b.similarity_score - a.similarity_score);
    return filtered.slice(0, limit);
  }

  /**
   * Calculate dynamic similarity threshold
   * @protected
   */
  calculateDynamicThreshold(query: string): number {
    return calculateDynamicThreshold(query, this.defaultThreshold, this.serviceName);
  }

  /**
   * Extract relevant excerpt from text
   * @protected
   */
  extractRelevantExcerpt(text: string | null | undefined, maxLength: number | null = null): string {
    const contentConfig = vectorConfig.get('content');
    const actualMaxLength = maxLength || contentConfig.maxExcerptLength;

    if (!text || text.length <= actualMaxLength) {
      return text || '';
    }

    let end = trimToSentenceBoundary(text, actualMaxLength, 'end', 120);

    if (end > actualMaxLength * 1.3) {
      const truncated = text.substring(0, actualMaxLength);
      const lastPunctuation = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('?'),
        truncated.lastIndexOf('!')
      );

      if (lastPunctuation > actualMaxLength * 0.5) {
        return truncated.substring(0, lastPunctuation + 1);
      }

      end = actualMaxLength;
      while (end > 0 && !/\s/.test(text[end - 1])) {
        end--;
      }
      if (end < actualMaxLength * 0.8) {
        end = actualMaxLength;
      }
    }

    const snippet = text.substring(0, end).trim();
    return snippet + (needsTrailingEllipsis(text, end) ? '...' : '');
  }

  /**
   * Validate search parameters
   * @protected
   */
  validateSearchParams(params: SearchParams): ValidatedSearchParams {
    return InputValidator.validateSearchParams(params);
  }

  /**
   * Get RPC function name based on filters
   * @protected
   */
  getRPCFunction(filters?: SearchFilters): string {
    return 'similarity_search_optimized';
  }

  /**
   * Build RPC parameters
   * @protected
   */
  buildRPCParams(params: {
    embeddingString: string;
    userId?: string | null;
    filters?: SearchFilters;
    limit: number;
    threshold: number;
  }): RPCParams {
    const { embeddingString, userId, limit, threshold } = params;

    return {
      query_embedding: embeddingString,
      user_id_filter: userId,
      similarity_threshold: threshold,
      match_count: limit
    };
  }

  /**
   * Transform database chunks to consistent format
   * @protected
   */
  transformChunks(chunks: RawChunk[]): TransformedChunk[] {
    return chunks.map(chunk => ({
      id: chunk.id,
      document_id: chunk.document_id,
      chunk_index: chunk.chunk_index,
      chunk_text: chunk.chunk_text,
      similarity: chunk.similarity,
      token_count: chunk.token_count,
      created_at: chunk.created_at,
      documents: {
        id: chunk.document_id,
        title: chunk.documents?.title || chunk.document_title,
        filename: chunk.documents?.filename || chunk.document_filename,
        created_at: chunk.documents?.created_at || chunk.document_created_at
      }
    }));
  }

  /**
   * Extract document ID from chunk
   */
  extractDocumentId(chunk: TransformedChunk): string {
    return chunk.documents?.id || chunk.document_id;
  }

  /**
   * Extract document title from chunk
   */
  extractDocumentTitle(chunk: TransformedChunk): string | undefined {
    return chunk.documents?.title;
  }

  /**
   * Extract document filename from chunk
   */
  extractDocumentFilename(chunk: TransformedChunk): string | undefined {
    return chunk.documents?.filename;
  }

  /**
   * Extract document created_at from chunk
   */
  extractDocumentCreatedAt(chunk: TransformedChunk): string | undefined {
    return chunk.documents?.created_at;
  }

  /**
   * Extract chunk data for processing
   */
  extractChunkData(chunk: TransformedChunk | RawChunk): ChunkData {
    const rawChunk = chunk as RawChunk;
    return {
      chunk_id: rawChunk.id,
      chunk_index: rawChunk.chunk_index,
      text: rawChunk.chunk_text,
      content_type: rawChunk.content_type ?? rawChunk.metadata?.content_type,
      page_number: rawChunk.page_number ?? rawChunk.metadata?.page_number,
      similarity: rawChunk.similarity || 0,
      token_count: rawChunk.token_count
    };
  }

  /**
   * Build relevance information string
   */
  buildRelevanceInfo(doc: DocumentData, enhancedScore: EnhancedScore): string {
    return `Found ${doc.chunks.length} relevant sections in "${doc.title}" (diversity: +${(enhancedScore.diversityBonus * 100).toFixed(1)}%)`;
  }

  /**
   * Find similar chunks using hybrid search
   * @protected
   */
  async findHybridChunks(params: HybridChunkParams): Promise<TransformedChunk[]> {
    const { embedding, userId, filters, limit, threshold } = params;

    // Perform vector search (default implementation)
    const vectorChunks = await this.findSimilarChunks({
      embedding,
      userId,
      filters,
      limit: Math.round(limit * 0.7),
      threshold
    });

    return vectorChunks.map(chunk => ({
      ...chunk,
      searchMethod: 'vector',
      originalVectorScore: chunk.similarity,
      originalTextScore: null
    }));
  }

  /**
   * Group and rank hybrid search results
   * @protected
   */
  async groupAndRankHybridResults(
    chunks: TransformedChunk[],
    limit: number,
    query = '',
    options: MMROptions = {}
  ): Promise<DocumentResult[]> {
    const documentMap = new Map<string, DocumentData>();
    const normQuery = normalizeQuery(query);
    const isShortQuery = (query || '').trim().split(/\s+/).filter(Boolean).length <= 2;

    // Group chunks by document with hybrid metadata
    for (const chunk of chunks) {
      const docId = this.extractDocumentId(chunk);

      if (!documentMap.has(docId)) {
        documentMap.set(docId, {
          document_id: docId,
          title: this.extractDocumentTitle(chunk),
          filename: this.extractDocumentFilename(chunk),
          created_at: this.extractDocumentCreatedAt(chunk),
          chunks: [],
          maxSimilarity: 0,
          avgSimilarity: 0,
          hybridMetadata: {
            hasVectorMatch: false,
            hasTextMatch: false,
            searchMethods: new Set<string>(),
            vectorScores: [],
            textScores: []
          }
        });
      }

      const docData = documentMap.get(docId)!;
      const chunkData = this.extractChunkData(chunk);

      // Lexical-aware adjustments
      const hasTerm = normQuery ? containsNormalized(chunkData.text, normQuery) : false;
      const isTOC = looksLikeTOC(chunkData.text);
      const inHeader = chunkData.content_type === 'heading';
      const adjusted = (chunkData.similarity || 0)
        + (hasTerm ? 0.12 : 0)
        + (hasTerm && inHeader ? 0.06 : 0)
        - (isTOC ? 0.08 : 0);

      chunkData.similarity_adjusted = adjusted;
      chunkData.has_term = hasTerm;
      chunkData.is_toc = isTOC;
      chunkData.searchMethod = (chunk as TransformedChunk & { searchMethod?: string }).searchMethod || 'unknown';
      chunkData.originalVectorScore = (chunk as TransformedChunk & { originalVectorScore?: number }).originalVectorScore ?? null;
      chunkData.originalTextScore = (chunk as TransformedChunk & { originalTextScore?: number }).originalTextScore ?? null;

      docData.chunks.push(chunkData);

      if (chunkData.similarity > docData.maxSimilarity) {
        docData.maxSimilarity = chunkData.similarity;
      }

      // Update hybrid metadata
      if (docData.hybridMetadata) {
        docData.hybridMetadata.searchMethods.add(chunkData.searchMethod);
        if (chunkData.originalVectorScore !== null) {
          docData.hybridMetadata.hasVectorMatch = true;
          docData.hybridMetadata.vectorScores.push(chunkData.originalVectorScore);
        }
        if (chunkData.originalTextScore !== null) {
          docData.hybridMetadata.hasTextMatch = true;
          docData.hybridMetadata.textScores.push(chunkData.originalTextScore);
        }
      }
    }

    // Calculate enhanced scores and format results
    const results: (DocumentResult | null)[] = Array.from(documentMap.values()).map(doc => {
      // Graduated filtering for short queries
      let noTermMatchPenalty = 0;
      if (normQuery && isShortQuery && !doc.chunks.some(c => c.has_term)) {
        if (doc.maxSimilarity < 0.55) {
          return null;
        }
        noTermMatchPenalty = doc.maxSimilarity >= 0.70 ? 0.05 : 0.12;
      }

      doc.chunks.sort((a, b) => (b.similarity_adjusted ?? b.similarity) - (a.similarity_adjusted ?? a.similarity));

      const enhancedScore = calculateHybridDocumentScore(
        doc.chunks,
        doc.hybridMetadata || {
          hasVectorMatch: false,
          hasTextMatch: false,
          searchMethods: new Set<string>(),
          vectorScores: [],
          textScores: []
        }
      );

      const contentConfig = vectorConfig.get('content');
      const maxN = contentConfig.maxChunksPerDocument;
      let topChunks = doc.chunks.slice(0, maxN);

      if (normQuery) {
        const idx = topChunks.findIndex(c => c.has_term);
        if (idx === -1) {
          const firstHit = doc.chunks.find(c => c.has_term);
          if (firstHit) topChunks = [firstHit, ...topChunks].slice(0, maxN);
        } else if (idx > 0) {
          const [hit] = topChunks.splice(idx, 1);
          topChunks.unshift(hit);
        }
      }

      const relevantContent = topChunks
        .map(chunk => (normQuery && chunk.has_term)
          ? extractMatchedExcerpt(chunk.text, query, contentConfig.maxExcerptLength)
          : this.extractRelevantExcerpt(chunk.text))
        .join('\n\n---\n\n');

      const searchMethods = Array.from(doc.hybridMetadata?.searchMethods || []);
      const hybridInfo = this.buildHybridRelevanceInfo(doc, enhancedScore, searchMethods);

      return {
        document_id: doc.document_id,
        title: doc.title,
        filename: doc.filename,
        created_at: doc.created_at,
        relevant_content: relevantContent,
        similarity_score: Math.max(0, enhancedScore.finalScore - noTermMatchPenalty),
        max_similarity: enhancedScore.maxSimilarity,
        avg_similarity: enhancedScore.avgSimilarity,
        position_score: enhancedScore.positionScore,
        diversity_bonus: enhancedScore.diversityBonus,
        hybrid_bonus: enhancedScore.hybridBonus || 0,
        quality_avg: typeof enhancedScore.qualityAvg === 'number' ? enhancedScore.qualityAvg : null,
        chunk_index: topChunks[0]?.chunk_index ?? null,
        top_chunks: topChunks.map(tc => ({
          chunk_index: tc.chunk_index,
          content_type: tc.content_type ?? null,
          page_number: tc.page_number ?? null,
          quality_score: typeof tc.quality_score === 'number' ? tc.quality_score : null,
          has_term: !!tc.has_term,
          preview: (normQuery && tc.has_term)
            ? extractMatchedExcerpt(tc.text, query, contentConfig.maxExcerptLength)
            : this.extractRelevantExcerpt(tc.text)
        })),
        chunk_count: doc.chunks.length,
        search_methods: searchMethods,
        hybrid_metadata: {
          hasVectorMatch: doc.hybridMetadata?.hasVectorMatch || false,
          hasTextMatch: doc.hybridMetadata?.hasTextMatch || false,
          avgVectorScore: doc.hybridMetadata && doc.hybridMetadata.vectorScores.length > 0
            ? doc.hybridMetadata.vectorScores.reduce((a, b) => a + b, 0) / doc.hybridMetadata.vectorScores.length
            : null,
          avgTextScore: doc.hybridMetadata && doc.hybridMetadata.textScores.length > 0
            ? doc.hybridMetadata.textScores.reduce((a, b) => a + b, 0) / doc.hybridMetadata.textScores.length
            : null
        },
        relevance_info: hybridInfo
      };
    });

    const filtered = results.filter((r): r is DocumentResult => r !== null);
    filtered.sort((a, b) => b.similarity_score - a.similarity_score);

    // Apply MMR if requested
    if (options.applyMMR) {
      return applyMMRSelection(filtered, limit, options.mmrLambda ?? 0.7);
    }

    return filtered.slice(0, limit);
  }

  /**
   * Build hybrid search relevance information
   * @protected
   */
  buildHybridRelevanceInfo(
    doc: DocumentData,
    enhancedScore: EnhancedScore,
    searchMethods: string[]
  ): string {
    const methods = searchMethods.join(', ');
    let info = `Found via ${methods} search in "${doc.title}"`;

    if (enhancedScore.hybridBonus && enhancedScore.hybridBonus > 0) {
      info += ` (semantic + text match bonus: +${(enhancedScore.hybridBonus * 100).toFixed(1)}%)`;
    }

    info += ` (diversity: +${(enhancedScore.diversityBonus * 100).toFixed(1)}%)`;

    return info;
  }

  /**
   * Get search type identifier
   * @protected
   */
  getSearchType(): string {
    return 'vector';
  }

  /**
   * Handle empty search results
   * @protected
   */
  handleEmptyResults(query: string, options: SearchOptions, userId: string | null = null): SearchResponse {
    return {
      success: true,
      results: [],
      query: query.trim(),
      searchType: this.getSearchType(),
      message: 'No relevant documents found'
    };
  }

  /**
   * Create error response
   * @protected
   */
  createErrorResponse(error: Error, query = ''): SearchResponse {
    if (error instanceof ValidationError) {
      return InputValidator.createSafeErrorResponse(error);
    }

    if (error instanceof SearchError) {
      return {
        success: false,
        error: error.message,
        code: (error as SearchError & { code?: string }).code,
        results: [],
        query: query.trim(),
        searchType: 'error',
        message: error.message
      };
    }

    return {
      success: false,
      error: 'Search failed',
      message: 'An unexpected error occurred during search',
      results: [],
      query: query.trim(),
      searchType: 'error'
    };
  }

  /**
   * Generate cache key for search parameters
   * @protected
   */
  generateCacheKey(params: ValidatedSearchParams | (ValidatedSearchParams & { searchType?: string })): string {
    const keyData = {
      query: params.query,
      userId: params.userId,
      filters: params.filters,
      limit: params.options?.limit,
      threshold: params.options?.threshold,
      searchType: (params as { searchType?: string }).searchType
    };

    return `${this.serviceName}:${this.simpleHash(JSON.stringify(keyData))}`;
  }

  /**
   * Simple hash function for cache keys
   * Uses centralized hashUtils for consistency
   * @protected
   */
  simpleHash(str: string): string {
    return hashString(str);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  // ========== STATIC UTILITY METHODS ==========

  /**
   * Group chunks by document and calculate enhanced rankings
   * @static
   */
  static groupByDocument(chunks: RawChunk[], limit = 10, options: MMROptions = {}): DocumentResult[] {
    const documentMap = new Map<string, DocumentData>();

    for (const chunk of chunks) {
      const docId = chunk.documents?.id || chunk.document_id;

      if (!documentMap.has(docId)) {
        documentMap.set(docId, {
          document_id: docId,
          title: chunk.documents?.title || chunk.document_title || 'Untitled',
          filename: chunk.documents?.filename || chunk.document_filename || '',
          created_at: chunk.documents?.created_at || chunk.document_created_at,
          chunks: [],
          maxSimilarity: 0,
          avgSimilarity: 0,
          totalScore: 0
        });
      }

      const doc = documentMap.get(docId)!;
      const chunkData: ChunkData = {
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        text: chunk.chunk_text,
        content_type: chunk.content_type ?? chunk.metadata?.content_type,
        page_number: chunk.page_number ?? chunk.metadata?.page_number,
        similarity: (chunk as RawChunk & { similarity_adjusted?: number }).similarity_adjusted ?? chunk.similarity ?? 0,
        token_count: chunk.token_count
      };

      doc.chunks.push(chunkData);
      doc.maxSimilarity = Math.max(doc.maxSimilarity, chunkData.similarity);
      doc.totalScore = (doc.totalScore || 0) + chunkData.similarity;
    }

    const results: DocumentResult[] = Array.from(documentMap.values()).map(doc => {
      doc.chunks.sort((a, b) => b.similarity - a.similarity);

      const enhancedScore = calculateStaticDocumentScore(doc.chunks);
      const topChunks = doc.chunks.slice(0, 3);

      const relevantContent = topChunks
        .map(chunk => BaseSearchService.extractExcerpt(chunk.text, 300))
        .join('\n\n---\n\n');

      return {
        document_id: doc.document_id,
        title: doc.title,
        filename: doc.filename,
        created_at: doc.created_at,
        relevant_content: relevantContent,
        similarity_score: enhancedScore.finalScore,
        max_similarity: enhancedScore.maxSimilarity,
        avg_similarity: enhancedScore.avgSimilarity,
        chunk_index: topChunks[0]?.chunk_index ?? null,
        top_chunks: topChunks.map(tc => ({
          chunk_index: tc.chunk_index,
          content_type: tc.content_type ?? null,
          page_number: tc.page_number ?? null,
          quality_score: typeof tc.quality_score === 'number' ? tc.quality_score : null,
          preview: BaseSearchService.extractExcerpt(tc.text, 300)
        })),
        chunk_count: doc.chunks.length,
        relevance_info: `Found ${doc.chunks.length} relevant sections in "${doc.title}"`
      };
    });

    results.sort((a, b) => b.similarity_score - a.similarity_score);

    if (options.applyMMR) {
      return applyMMRSelection(results, limit, options.mmrLambda ?? 0.7);
    }

    return results.slice(0, limit);
  }

  /**
   * Calculate enhanced document score
   * @static
   */
  static calculateDocumentScore(chunks: ChunkData[]): EnhancedScore {
    return calculateStaticDocumentScore(chunks);
  }

  /**
   * Calculate dynamic similarity threshold
   * @static
   */
  static calculateThreshold(query: string, baseThreshold = 0.3): number {
    return calculateStaticThreshold(query, baseThreshold);
  }

  /**
   * Extract relevant excerpt with smart truncation
   * @static
   */
  static extractExcerpt(text: string | null | undefined, maxLength = 300): string {
    if (!text || text.length <= maxLength) {
      return text || '';
    }

    const truncated = text.substring(0, maxLength);
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('?'),
      truncated.lastIndexOf('!')
    );

    if (lastPunctuation > maxLength * 0.7) {
      return truncated.substring(0, lastPunctuation + 1);
    }

    return truncated + '...';
  }

  /**
   * Format search results with consistent structure
   * @static
   */
  static formatResults(
    chunks: RawChunk[],
    limit = 10,
    searchType = 'vector'
  ): SearchResponse {
    if (!chunks || chunks.length === 0) {
      return {
        success: true,
        results: [],
        query: '',
        searchType,
        message: 'No relevant documents found'
      };
    }

    const documents = BaseSearchService.groupByDocument(chunks, limit);

    return {
      success: true,
      results: documents,
      query: '',
      searchType,
      message: `Found ${documents.length} relevant document(s)`,
      metadata: {
        totalChunks: chunks.length,
        processedDocuments: documents.length
      }
    };
  }

  // ========== TEMPLATE METHODS ==========

  /**
   * Template method for search operations
   */
  async search(params: SearchParams): Promise<SearchResponse> {
    try {
      const validated = this.validate(params);
      const results = await this.doSearch(validated);
      return this.format(results, validated);
    } catch (error) {
      console.error(`[${this.serviceName}] Search error:`, error);
      return this.createErrorResponse(error as Error, params.query);
    }
  }

  /**
   * Abstract method - must be implemented by subclasses
   */
  async doSearch(params: ValidatedSearchParams): Promise<RawChunk[]> {
    throw new Error(`${this.serviceName} must implement doSearch() method`);
  }

  /**
   * Validate search parameters
   */
  validate(params: SearchParams): ValidatedSearchParams {
    return InputValidator.validateSearchParams(params);
  }

  /**
   * Format search results
   */
  format(results: RawChunk[], params: ValidatedSearchParams): SearchResponse {
    return BaseSearchService.formatResults(results, params.options.limit, this.getSearchType());
  }
}
