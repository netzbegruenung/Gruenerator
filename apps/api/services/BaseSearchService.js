/**
 * Base Search Service - Template method pattern for search services
 *
 * Provides shared utilities and template methods for all search implementations.
 * Eliminates code duplication while allowing customization through inheritance.
 */

import { fastEmbedService } from './FastEmbedService.js';
import { InputValidator, ValidationError } from '../utils/inputValidation.js';
import { createCache } from '../utils/lruCache.js';
import { SearchError, DatabaseError, createErrorHandler } from '../utils/errorHandling.js';
import { vectorConfig } from '../config/vectorConfig.js';
import {
  foldUmlauts,
  normalizeQuery,
  normalizeText,
  generateQueryVariants,
  containsNormalized
} from '../utils/textNormalization.js';

function looksLikeTOC(text) {
  if (!text) return false;
  const t = text.trim();
  if (/inhaltsverzeichnis/i.test(t)) return true;
  if (/\.\.{2,}\s*\d{1,4}\b/.test(t)) return true; // dot leaders + page number
  const lines = t.split(/\n/);
  const shortLines = lines.filter(l => l.trim().length > 0 && l.trim().length <= 60);
  const digits = (t.match(/\d/g) || []).length;
  if (shortLines.length >= 2 && digits >= 6) return true;
  return false;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightTerm(text, term) {
  if (!text || !term) return text || '';
  try {
    const re = new RegExp(`(${escapeRegExp(term)})`, 'gi');
    return text.replace(re, '**$1**');
  } catch {
    return text;
  }
}

function trimToSentenceBoundary(text, position, direction = 'start', maxSearch = 150) {
  if (!text || position < 0 || position >= text.length) return position;
  const sentenceEnders = /[.!?]/;

  if (direction === 'start') {
    let searchStart = Math.max(0, position - maxSearch);
    let lastSentenceEnd = -1;
    for (let i = searchStart; i < position; i++) {
      if (sentenceEnders.test(text[i])) {
        lastSentenceEnd = i;
      }
    }
    if (lastSentenceEnd !== -1) {
      let newPos = lastSentenceEnd + 1;
      while (newPos < text.length && /\s/.test(text[newPos])) {
        newPos++;
      }
      return newPos;
    }
    while (position < text.length && !/\s/.test(text[position])) {
      position++;
    }
    while (position < text.length && /\s/.test(text[position])) {
      position++;
    }
    return position;
  } else {
    let searchEnd = Math.min(text.length, position + maxSearch);
    for (let i = position; i < searchEnd; i++) {
      if (sentenceEnders.test(text[i])) {
        return i + 1;
      }
    }
    while (position > 0 && !/\s/.test(text[position - 1])) {
      position--;
    }
    return position;
  }
}

function needsLeadingEllipsis(text, start) {
  if (start === 0) return false;
  const charBefore = text[start - 1];
  if (/[.!?]/.test(charBefore)) return false;
  const textBefore = text.slice(Math.max(0, start - 3), start).trim();
  if (/[.!?]$/.test(textBefore)) return false;
  return true;
}

function needsTrailingEllipsis(text, end) {
  if (end >= text.length) return false;
  const lastChar = text[end - 1];
  if (/[.!?]/.test(lastChar)) return false;
  return true;
}

function extractMatchedExcerpt(text, term, maxLen = 400) {
  if (!text) return '';
  if (!term) {
    if (text.length <= maxLen) return text;
    let end = trimToSentenceBoundary(text, maxLen, 'end', 100);
    if (end > maxLen * 1.3) end = maxLen;
    const snippet = text.slice(0, end).trim();
    return snippet + (needsTrailingEllipsis(text, end) ? '...' : '');
  }

  const lower = text.toLowerCase();
  const q = term.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    if (text.length <= maxLen) return text;
    let end = trimToSentenceBoundary(text, maxLen, 'end', 100);
    if (end > maxLen * 1.3) end = maxLen;
    const snippet = text.slice(0, end).trim();
    return snippet + (needsTrailingEllipsis(text, end) ? '...' : '');
  }

  let start = Math.max(0, idx - Math.floor(maxLen * 0.4));
  let end = Math.min(text.length, idx + Math.floor(maxLen * 0.6));

  if (start > 0) {
    start = trimToSentenceBoundary(text, start, 'start', 120);
  }
  if (end < text.length) {
    end = trimToSentenceBoundary(text, end, 'end', 120);
    if (end > start + maxLen * 1.4) {
      end = start + maxLen;
      while (end > start && !/\s/.test(text[end - 1])) {
        end--;
      }
    }
  }

  const prefix = needsLeadingEllipsis(text, start) ? '...' : '';
  const suffix = needsTrailingEllipsis(text, end) ? '...' : '';
  const snippet = prefix + text.slice(start, end).trim() + suffix;
  return highlightTerm(snippet, term);
}

/**
 * Base search service providing common search functionality
 */
class BaseSearchService {
  constructor(options = {}) {
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
    const cacheConfig = vectorConfig.getCacheConfig(options.cacheType || 'baseService');
    this.cache = createCache.general({
      name: `${this.serviceName}Cache`,
      maxSize: options.cacheSize || cacheConfig.maxSize,
      ttl: options.cacheTTL || cacheConfig.ttl
    });
  }

  /**
   * Perform vector similarity search with common logic
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async performSimilaritySearch(params) {
    try {
      // Validate and sanitize parameters
      const validatedParams = this.validateSearchParams(params);
      const { query, userId, filters, options } = validatedParams;
      
      console.log(`[${this.serviceName}] Performing similarity search for: "${query}"`);
      
      // Check cache first
      if (options.useCache) {
        const cacheKey = this.generateCacheKey(validatedParams);
        const cached = this.cache.get(cacheKey);
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
        limit: Math.round(options.limit * this.chunkMultiplier), // Get more for better ranking
        threshold,
        query
      });
      console.log(`[${this.serviceName}] Retrieved ${chunks.length} chunks from vector search`);
      
      // Handle empty results
      if (chunks.length === 0) {
        return this.handleEmptyResults(query, options, userId);
      }
      
      // Group and rank results (pass query for lexical-aware ranking)
      const results = await this.groupAndRankResults(chunks, options.limit, query);
      
      // Build response
      const response = {
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
      return this.errorHandler.handle(error, {
        operation: 'similarity_search',
        query: params.query,
        userId: params.userId,
        returnResponse: true
      });
    }
  }

  /**
   * Perform hybrid search combining vector similarity with text matching
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Hybrid search results
   */
  async performHybridSearch(params) {
    try {
      // Validate and sanitize parameters
      const validatedParams = this.validateSearchParams(params);
      const { query, userId, filters, options } = validatedParams;
      
      console.log(`[${this.serviceName}] Performing hybrid search for: "${query}"`);
      
      // Check cache first
      if (options.useCache) {
        const cacheKey = this.generateCacheKey({...validatedParams, searchType: 'hybrid'});
        const cached = this.cache.get(cacheKey);
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
      const { keywordExtractor } = await import('./keywordExtractor.js');
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
          // Prefer text-leaning weighted fusion by default; caller can override
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
      
      // Group and rank results with hybrid scoring (pass query for lexical-aware ranking)
      const results = await this.groupAndRankHybridResults(chunks, options.limit, query, {
        applyMMR: true,
        mmrLambda: 0.7
      });
      
      // Build response
      const response = {
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
        const cacheKey = this.generateCacheKey({...validatedParams, searchType: 'hybrid'});
        this.cache.set(cacheKey, response);
      }
      
      console.log(`[${this.serviceName}] Found ${results.length} hybrid results for: "${query}"`);
      return response;
      
    } catch (error) {
      return this.errorHandler.handle(error, {
        operation: 'hybrid_search',
        query: params.query,
        userId: params.userId,
        returnResponse: true
      });
    }
  }

  /**
   * Generate query embedding with smart expansion support
   * @param {string} query - Search query
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Query embedding
   * @protected
   */
  async generateQueryEmbedding(query, options = {}) {
    // Can be overridden by subclasses for smart expansion
    return await fastEmbedService.generateQueryEmbedding(query);
  }

  /**
   * Find similar chunks in the database
   * @param {Object} params - Search parameters
   * @returns {Promise<Array>} Array of similar chunks
   * @protected
   */
  async findSimilarChunks(params) {
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
    
    const { data: chunks, error } = await supabaseService.rpc(rpcFunction, rpcParams);
    
    if (error) {
      throw new DatabaseError(`Search RPC failed: ${error.message}`, 'RPC_ERROR', { 
        rpcFunction, 
        operation: 'similarity_search',
        originalError: error 
      });
    }
    
    // Transform results to consistent format
    return this.transformChunks(chunks || []);
  }

  /**
   * Group chunks by document and calculate rankings
   * @param {Array} chunks - Array of document chunks
   * @param {number} limit - Maximum results to return
   * @returns {Promise<Array>} Ranked document results
   * @protected
   */
  async groupAndRankResults(chunks, limit, query = '') {
    const documentMap = new Map();
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
      
      const docData = documentMap.get(docId);
      const chunkData = this.extractChunkData(chunk);
      // Lexical-aware adjustments per chunk
      const hasTerm = normQuery ? containsNormalized(chunkData.text, normQuery) : false;
      const isTOC = looksLikeTOC(chunkData.text);
      const inHeader = (chunkData.content_type === 'heading');
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
    const results = Array.from(documentMap.values()).map(doc => {
      // For short queries, require at least one literal match
      if (normQuery && isShortQuery && !doc.chunks.some(c => c.has_term)) {
        return null; // filtered
      }
      // Sort chunks by adjusted similarity (fallback to raw)
      doc.chunks.sort((a, b) => (b.similarity_adjusted ?? b.similarity) - (a.similarity_adjusted ?? a.similarity));
      
      // Calculate enhanced document score
      const enhancedScore = this.calculateEnhancedDocumentScore(doc.chunks);
      
      // Take top chunks per document using configuration
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
        // expose first top chunk index for callers expecting it at top-level
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
    
    // Remove filtered docs
    const filtered = results.filter(Boolean);
    // Sort by enhanced final score and return top results
    filtered.sort((a, b) => b.similarity_score - a.similarity_score);
    return filtered.slice(0, limit);
  }

  /**
   * Calculate enhanced document score with position weighting and diversity bonus
   * @param {Array} chunks - Array of document chunks with similarity scores
   * @returns {Object} Enhanced scoring metrics
   * @protected
   */
  calculateEnhancedDocumentScore(chunks) {
    const scoringConfig = vectorConfig.get('scoring');
    
    if (!chunks || chunks.length === 0) {
      return {
        finalScore: 0,
        maxSimilarity: 0,
        avgSimilarity: 0,
        positionScore: 0,
        diversityBonus: 0
      };
    }
    
    const similarities = chunks.map(c => (c.similarity_adjusted ?? c.similarity) || 0);
    const maxSimilarity = Math.max(...similarities);
    const avgSimilarity = similarities.reduce((a, b) => a + b) / similarities.length;
    
    // Position-aware scoring using configuration
    let positionScore = 0;
    const minPositionWeight = (typeof scoringConfig.minPositionWeight === 'number') ? scoringConfig.minPositionWeight : 0.1;
    const positionDecayRate = (typeof scoringConfig.positionDecayRate === 'number') ? scoringConfig.positionDecayRate : 0.05;
    chunks.forEach((chunk) => {
      const positionWeight = Math.max(minPositionWeight, 1 - (chunk.chunk_index * positionDecayRate));
      positionScore += ((chunk.similarity_adjusted ?? chunk.similarity) || 0) * positionWeight;
    });
    positionScore = positionScore / chunks.length;
    
    // Diversity bonus using configuration
    const diversityBonus = Math.min(
      scoringConfig.maxDiversityBonus, 
      chunks.length * scoringConfig.diversityBonusRate
    );
    
    // Weighted final score using configuration
    const maxW = (typeof scoringConfig.maxSimilarityWeight === 'number') ? scoringConfig.maxSimilarityWeight : 0.6;
    const avgW = (typeof scoringConfig.avgSimilarityWeight === 'number') ? scoringConfig.avgSimilarityWeight : 0.4;
    const posW = (typeof scoringConfig.positionWeight === 'number') ? scoringConfig.positionWeight : 0.0;
    const finalScore = (maxSimilarity * maxW) + (avgSimilarity * avgW) + (positionScore * posW) + diversityBonus;
    
    return {
      finalScore: Math.min((typeof scoringConfig.maxFinalScore === 'number' ? scoringConfig.maxFinalScore : 1.0), finalScore),
      maxSimilarity,
      avgSimilarity,
      positionScore,
      diversityBonus
    };
  }

  /**
   * Calculate dynamic similarity threshold based on query characteristics
   * @param {string} query - Search query
   * @returns {number} Calculated threshold between min and max
   * @protected
   */
  calculateDynamicThreshold(query) {
    const searchConfig = vectorConfig.get('search');
    const baseThreshold = this.defaultThreshold;
    const queryWords = query.trim().split(/\s+/);
    const queryLength = queryWords.length;
    
    // Query length adjustment using configuration
    const adjustments = searchConfig.lengthAdjustments;
    let lengthAdjustment = 0;
    
    if (queryLength === 1) {
      lengthAdjustment = adjustments.singleWord;
    } else if (queryLength === 2) {
      lengthAdjustment = adjustments.twoWords;
    } else if (queryLength >= adjustments.manyWordsThreshold) {
      lengthAdjustment = adjustments.manyWords;
    }
    
    const finalThreshold = baseThreshold + lengthAdjustment;
    const clampedThreshold = Math.max(
      searchConfig.minThreshold, 
      Math.min(searchConfig.maxThreshold, finalThreshold)
    );
    
    if (vectorConfig.isVerboseMode()) {
      console.log(`[${this.serviceName}] Dynamic threshold: base=${baseThreshold}, length_adj=${lengthAdjustment}, final=${clampedThreshold}`);
    }
    
    return clampedThreshold;
  }

  /**
   * Extract relevant excerpt from text
   * @param {string} text - Text to excerpt
   * @param {number} maxLength - Maximum length (defaults to config value)
   * @returns {string} Excerpted text
   * @protected
   */
  extractRelevantExcerpt(text, maxLength = null) {
    const contentConfig = vectorConfig.get('content');
    const actualMaxLength = maxLength || contentConfig.maxExcerptLength;

    if (!text || text.length <= actualMaxLength) {
      return text;
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

  // Abstract methods to be implemented by subclasses

  /**
   * Validate search parameters (should be overridden)
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validated parameters
   * @protected
   */
  validateSearchParams(params) {
    // Basic validation - subclasses should override for specific validation
    return InputValidator.validateSearchParams(params);
  }

  /**
   * Get RPC function name based on filters
   * @param {Object} filters - Search filters
   * @returns {string} RPC function name
   * @protected
   */
  getRPCFunction(filters) {
    // Override in subclasses
    return 'similarity_search_optimized';
  }

  /**
   * Build RPC parameters
   * @param {Object} params - Parameter object
   * @returns {Object} RPC parameters
   * @protected
   */
  buildRPCParams(params) {
    const { embeddingString, userId, filters, limit, threshold } = params;
    
    return {
      query_embedding: embeddingString,
      user_id_filter: userId,
      similarity_threshold: threshold,
      match_count: limit
    };
  }

  /**
   * Transform database chunks to consistent format
   * @param {Array} chunks - Raw database chunks
   * @returns {Array} Transformed chunks
   * @protected
   */
  transformChunks(chunks) {
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
        title: chunk.document_title,
        filename: chunk.document_filename,
        created_at: chunk.document_created_at
      }
    }));
  }

  /**
   * Extract document ID from chunk
   */
  extractDocumentId(chunk) {
    return chunk.documents?.id || chunk.document_id;
  }

  /**
   * Extract document title from chunk
   */
  extractDocumentTitle(chunk) {
    return chunk.documents?.title || chunk.document_title;
  }

  /**
   * Extract document filename from chunk
   */
  extractDocumentFilename(chunk) {
    return chunk.documents?.filename || chunk.document_filename;
  }

  /**
   * Extract document created_at from chunk
   */
  extractDocumentCreatedAt(chunk) {
    return chunk.documents?.created_at || chunk.document_created_at;
  }

  /**
   * Extract chunk data for processing
   */
  extractChunkData(chunk) {
    return {
      chunk_id: chunk.id,
      chunk_index: chunk.chunk_index,
      text: chunk.chunk_text,
      // Surface optional metadata when available for UI hints
      content_type: chunk.content_type ?? (chunk.metadata?.content_type),
      page_number: chunk.page_number ?? (chunk.metadata?.page_number),
      similarity: chunk.similarity || 0,
      token_count: chunk.token_count
    };
  }

  /**
   * Build relevance information string
   */
  buildRelevanceInfo(doc, enhancedScore) {
    return `Found ${doc.chunks.length} relevant sections in "${doc.title}" (diversity: +${(enhancedScore.diversityBonus * 100).toFixed(1)}%)`;
  }

  /**
   * Find similar chunks using hybrid search (vector + text)
   * @param {Object} params - Search parameters including hybrid options
   * @returns {Promise<Array>} Array of similar chunks with hybrid scores
   * @protected
   */
  async findHybridChunks(params) {
    // Default implementation - subclasses should override for specific hybrid logic
    // This is a fallback that combines vector and simple text matching
    
    const { embedding, query, userId, filters, limit, threshold, hybridOptions } = params;
    
    // Perform vector search
    const vectorChunks = await this.findSimilarChunks({
      embedding,
      userId,
      filters,
      limit: Math.round(limit * 0.7), // Use 70% of limit for vector
      threshold
    });
    
    // For base implementation, return vector results
    // Subclasses should override this to implement proper hybrid search
    return vectorChunks.map(chunk => ({
      ...chunk,
      searchMethod: 'vector',
      originalVectorScore: chunk.similarity,
      originalTextScore: null
    }));
  }

  /**
   * Group and rank hybrid search results
   * @param {Array} chunks - Hybrid search results
   * @param {number} limit - Maximum results to return
   * @returns {Promise<Array>} Ranked document results with hybrid metadata
   * @protected
   */
  async groupAndRankHybridResults(chunks, limit, query = '', options = {}) {
    // Enhanced version of groupAndRankResults with hybrid features
    const documentMap = new Map();
    const normQuery = normalizeQuery(query);
    const isShortQuery = (query || '').trim().split(/\s+/).filter(Boolean).length <= 2;
    const dossierMode = options.dossierMode || false;
    
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
            searchMethods: new Set(),
            vectorScores: [],
            textScores: []
          }
        });
      }
      
      const docData = documentMap.get(docId);
      const chunkData = this.extractChunkData(chunk);
      // Lexical-aware adjustments per chunk
      const hasTerm = normQuery ? containsNormalized(chunkData.text, normQuery) : false;
      const isTOC = looksLikeTOC(chunkData.text);
      const inHeader = (chunkData.content_type === 'heading');
      const adjusted = (chunkData.similarity || 0)
        + (hasTerm ? 0.12 : 0)
        + (hasTerm && inHeader ? 0.06 : 0)
        - (isTOC ? 0.08 : 0);
      chunkData.similarity_adjusted = adjusted;
      chunkData.has_term = hasTerm;
      chunkData.is_toc = isTOC;
      
      // Add hybrid metadata
      chunkData.searchMethod = chunk.searchMethod || 'unknown';
      chunkData.originalVectorScore = chunk.originalVectorScore;
      chunkData.originalTextScore = chunk.originalTextScore;
      
      docData.chunks.push(chunkData);
      
      // Update similarity tracking
      if (chunkData.similarity > docData.maxSimilarity) {
        docData.maxSimilarity = chunkData.similarity;
      }
      
      // Update hybrid metadata
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
    
    // Calculate enhanced scores and format results
    const results = Array.from(documentMap.values()).map(doc => {
      // For short queries without exact term match, apply graduated response based on similarity
      let noTermMatchPenalty = 0;
      if (normQuery && isShortQuery && !doc.chunks.some(c => c.has_term)) {
        if (doc.maxSimilarity < 0.55) {
          return null;  // Low similarity + no term = likely noise
        }
        // High similarity semantic matches get small penalty, medium gets larger
        noTermMatchPenalty = doc.maxSimilarity >= 0.70 ? 0.05 : 0.12;
      }
    // Sort by adjusted score
    doc.chunks.sort((a, b) => (b.similarity_adjusted ?? b.similarity) - (a.similarity_adjusted ?? a.similarity));
      
      // Calculate hybrid-aware enhanced document score
      const enhancedScore = this.calculateHybridDocumentScore(doc.chunks, doc.hybridMetadata);
      
      // Take top chunks per document using configuration
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
      
      // Create combined relevant text
      const relevantContent = topChunks
        .map(chunk => (normQuery && chunk.has_term)
          ? extractMatchedExcerpt(chunk.text, query, contentConfig.maxExcerptLength)
          : this.extractRelevantExcerpt(chunk.text))
        .join('\n\n---\n\n');
      
      // Generate hybrid search info
      const searchMethods = Array.from(doc.hybridMetadata.searchMethods);
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
        // expose first top chunk index for callers expecting it at top-level
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
          hasVectorMatch: doc.hybridMetadata.hasVectorMatch,
          hasTextMatch: doc.hybridMetadata.hasTextMatch,
          avgVectorScore: doc.hybridMetadata.vectorScores.length > 0 
            ? doc.hybridMetadata.vectorScores.reduce((a, b) => a + b) / doc.hybridMetadata.vectorScores.length 
            : null,
          avgTextScore: doc.hybridMetadata.textScores.length > 0
            ? doc.hybridMetadata.textScores.reduce((a, b) => a + b) / doc.hybridMetadata.textScores.length
            : null
        },
        relevance_info: hybridInfo
      };
    });
    
    const filtered = results.filter(Boolean);
    filtered.sort((a, b) => b.similarity_score - a.similarity_score);
    return filtered.slice(0, limit);
  }

  /**
   * Calculate enhanced document score with hybrid search factors
   * @param {Array} chunks - Array of document chunks with hybrid metadata
   * @param {Object} hybridMetadata - Document-level hybrid metadata
   * @returns {Object} Enhanced scoring metrics with hybrid bonuses
   * @protected
   */
  calculateHybridDocumentScore(chunks, hybridMetadata) {
    const baseScore = this.calculateEnhancedDocumentScore(chunks);
    
    // Add hybrid search bonus
    let hybridBonus = 0;
    if (hybridMetadata.hasVectorMatch && hybridMetadata.hasTextMatch) {
      hybridBonus = 0.05; // Bonus for documents found by both search methods
    }
    
    return {
      ...baseScore,
      finalScore: Math.min(1.0, baseScore.finalScore + hybridBonus),
      hybridBonus
    };
  }

  /**
   * Build hybrid search relevance information
   * @param {Object} doc - Document data
   * @param {Object} enhancedScore - Enhanced scoring data
   * @param {Array} searchMethods - Search methods used
   * @returns {string} Formatted relevance information
   * @protected
   */
  buildHybridRelevanceInfo(doc, enhancedScore, searchMethods) {
    const methods = searchMethods.join(', ');
    let info = `Found via ${methods} search in "${doc.title}"`;
    
    if (enhancedScore.hybridBonus > 0) {
      info += ` (semantic + text match bonus: +${(enhancedScore.hybridBonus * 100).toFixed(1)}%)`;
    }
    
    info += ` (diversity: +${(enhancedScore.diversityBonus * 100).toFixed(1)}%)`;
    
    return info;
  }

  /**
   * Get search type identifier
   * @returns {string} Search type
   * @protected
   */
  getSearchType() {
    return 'vector';
  }

  /**
   * Handle empty search results
   * @param {string} query - Original query
   * @param {Object} options - Search options
   * @param {string} userId - User ID (for subclass fallback implementations)
   * @returns {Object} Empty results response
   * @protected
   */
  handleEmptyResults(query, options, userId = null) {
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
   * @param {Error} error - Error that occurred
   * @param {string} query - Original query
   * @returns {Object} Error response
   * @protected
   */
  createErrorResponse(error, query = '') {
    if (error instanceof ValidationError) {
      return InputValidator.createSafeErrorResponse(error);
    }
    
    if (error instanceof SearchError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        results: [],
        query: query.trim(),
        searchType: 'error'
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
   * @param {Object} params - Search parameters
   * @returns {string} Cache key
   * @protected
   */
  generateCacheKey(params) {
    const keyData = {
      query: params.query,
      userId: params.userId,
      filters: params.filters,
      limit: params.options?.limit,
      threshold: params.options?.threshold
    };
    
    return `${this.serviceName}:${this.simpleHash(JSON.stringify(keyData))}`;
  }

  /**
   * Simple hash function for cache keys
   * @param {string} str - String to hash
   * @returns {string} Hash string
   * @protected
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  // ========== STATIC UTILITY METHODS ==========
  // Shared utilities that can be used by all search services

  /**
   * Group chunks by document and calculate enhanced rankings
   * @param {Array} chunks - Array of document chunks
   * @param {number} limit - Maximum results to return
   * @returns {Array} Ranked document results
   * @static
   */
  static groupByDocument(chunks, limit = 10) {
    const documentMap = new Map();
    
    // Group chunks by document
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
          totalScore: 0
        });
      }
      
      const doc = documentMap.get(docId);
      const chunkData = {
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        text: chunk.chunk_text,
        // surface optional metadata for UI hints
        content_type: chunk.content_type ?? (chunk.metadata?.content_type),
        page_number: chunk.page_number ?? (chunk.metadata?.page_number),
        similarity: (chunk.similarity_adjusted ?? chunk.similarity) || 0,
        token_count: chunk.token_count
      };
      
      doc.chunks.push(chunkData);
      doc.maxSimilarity = Math.max(doc.maxSimilarity, chunkData.similarity);
      doc.totalScore += chunkData.similarity;
    }
    
    // Calculate scores and format results
    const results = Array.from(documentMap.values()).map(doc => {
      // Sort chunks by similarity
      doc.chunks.sort((a, b) => b.similarity - a.similarity);
      
      // Calculate enhanced document score
      const enhancedScore = BaseSearchService.calculateDocumentScore(doc.chunks);
      
      // Take top chunks for content
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
        // expose first top chunk index for callers expecting a fallback hint
        chunk_index: topChunks[0]?.chunk_index ?? null,
        // include a minimal top_chunks structure for consistency with other paths
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
    
    // Sort by final score
    results.sort((a, b) => b.similarity_score - a.similarity_score);

    // Optional MMR selection for diversity across documents
    const applyMMR = options.applyMMR === true;
    if (!applyMMR) {
      return results.slice(0, limit);
    }

    const mmrLambda = typeof options.mmrLambda === 'number' ? options.mmrLambda : 0.7;
    const selected = [];
    const used = new Set();

    // Precompute simple token sets for similarity approximation
    const tokenCache = new Map();
    const getTokens = (text) => {
      if (tokenCache.has(text)) return tokenCache.get(text);
      const tokens = (text || '')
        .toLowerCase()
        .replace(/[^a-zäöüß0-9\s]/gi, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 4);
      const set = new Set(tokens);
      tokenCache.set(text, set);
      return set;
    };
    const jaccard = (aSet, bSet) => {
      if (!aSet || !bSet) return 0;
      let inter = 0;
      for (const t of aSet) if (bSet.has(t)) inter++;
      const union = aSet.size + bSet.size - inter;
      return union > 0 ? inter / union : 0;
    };

    while (selected.length < Math.min(limit, results.length)) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < results.length; i++) {
        if (used.has(i)) continue;
        const cand = results[i];
        const rel = cand.similarity_score || 0;
        let maxSim = 0;
        if (selected.length > 0) {
          const candTok = getTokens(cand.relevant_content || '');
          for (const s of selected) {
            const selTok = getTokens(s.relevant_content || '');
            const sim = jaccard(candTok, selTok);
            if (sim > maxSim) maxSim = sim;
          }
        }
        const mmrScore = mmrLambda * rel - (1 - mmrLambda) * maxSim;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          best = i;
        }
      }
      if (best === null) break;
      used.add(best);
      selected.push(results[best]);
    }

    return selected;
  }

  /**
   * Calculate enhanced document score with position weighting and diversity bonus
   * @param {Array} chunks - Array of document chunks with similarity scores
   * @returns {Object} Enhanced scoring metrics
   * @static
   */
  static calculateDocumentScore(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        finalScore: 0,
        maxSimilarity: 0,
        avgSimilarity: 0,
        positionScore: 0,
        diversityBonus: 0
      };
    }
    
    const similarities = chunks.map(c => (c.similarity_adjusted ?? c.similarity) || 0);
    const maxSimilarity = Math.max(...similarities);
    const avgSimilarity = similarities.reduce((a, b) => a + b) / similarities.length;
    
    // Position-aware scoring
    let positionScore = 0;
    chunks.forEach((chunk) => {
      const positionWeight = Math.max(0.1, 1 - (chunk.chunk_index * 0.05));
      positionScore += ((chunk.similarity_adjusted ?? chunk.similarity) || 0) * positionWeight;
    });
    positionScore = positionScore / chunks.length;
    
    // Diversity bonus
    const diversityBonus = Math.min(0.1, chunks.length * 0.02);
    
    // Weighted final score
    const finalScore = (maxSimilarity * 0.6) + (avgSimilarity * 0.3) + (positionScore * 0.1) + diversityBonus;
    
    return {
      finalScore: Math.min(1.0, finalScore),
      maxSimilarity,
      avgSimilarity,
      positionScore,
      diversityBonus
    };
  }

  /**
   * Calculate dynamic similarity threshold based on query characteristics
   * @param {string} query - Search query
   * @param {number} baseThreshold - Base threshold (default: 0.3)
   * @returns {number} Calculated threshold
   * @static
   */
  static calculateThreshold(query, baseThreshold = 0.3) {
    const queryWords = query.trim().split(/\s+/);
    const queryLength = queryWords.length;
    
    let adjustment = 0;
    if (queryLength === 1) {
      adjustment = 0.0;
    } else if (queryLength === 2) {
      adjustment = 0.05;
    } else if (queryLength >= 5) {
      adjustment = -0.1;
    }
    
    return Math.max(0.2, Math.min(0.8, baseThreshold + adjustment));
  }

  /**
   * Extract relevant excerpt from text with smart truncation
   * @param {string} text - Text to excerpt
   * @param {number} maxLength - Maximum length (default: 300)
   * @returns {string} Excerpted text
   * @static
   */
  static extractExcerpt(text, maxLength = 300) {
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
   * @param {Array} chunks - Raw search results
   * @param {number} limit - Maximum results
   * @param {string} searchType - Search type identifier
   * @returns {Object} Formatted search response
   * @static
   */
  static formatResults(chunks, limit = 10, searchType = 'vector') {
    if (!chunks || chunks.length === 0) {
      return {
        success: true,
        results: [],
        searchType,
        message: 'No relevant documents found'
      };
    }

    const documents = BaseSearchService.groupByDocument(chunks, limit);
    
    return {
      success: true,
      results: documents,
      searchType,
      message: `Found ${documents.length} relevant document(s)`,
      metadata: {
        totalChunks: chunks.length,
        processedDocuments: documents.length
      }
    };
  }

  // ========== TEMPLATE METHODS ==========
  // Core template method that can be overridden by subclasses

  /**
   * Template method for search operations
   * Override doSearch() in subclasses for specific implementations
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async search(params) {
    try {
      // Validate parameters
      const validated = this.validate(params);
      
      // Execute search (implemented by subclasses)
      const results = await this.doSearch(validated);
      
      // Format results
      return this.format(results, validated);
      
    } catch (error) {
      console.error(`[${this.serviceName}] Search error:`, error);
      return this.createErrorResponse(error, params.query);
    }
  }

  /**
   * Abstract method - must be implemented by subclasses
   * @param {Object} params - Validated search parameters
   * @returns {Promise<Array>} Raw search results
   */
  async doSearch(params) {
    throw new Error(`${this.serviceName} must implement doSearch() method`);
  }

  /**
   * Validate search parameters (can be overridden)
   * @param {Object} params - Parameters to validate
   * @returns {Object} Validated parameters
   */
  validate(params) {
    return InputValidator.validateSearchParams(params);
  }

  /**
   * Format search results (can be overridden)
   * @param {Array} results - Raw results
   * @param {Object} params - Search parameters
   * @returns {Object} Formatted results
   */
  format(results, params) {
    return BaseSearchService.formatResults(results, params.limit, this.getSearchType());
  }

  /**
   * Get search type identifier (should be overridden)
   * @returns {string} Search type
   */
  getSearchType() {
    return 'base';
  }
}

export { BaseSearchService, SearchError };
