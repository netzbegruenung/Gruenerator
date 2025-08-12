import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from './embeddingService.js';
import { smartQueryExpansion } from './smartQueryExpansion.js';
import { InputValidator, ValidationError } from '../utils/inputValidation.js';
import { BaseSearchService, SearchError } from './BaseSearchService.js';
import { grundsatzSearchService } from './GrundsatzSearchService.js';
import { createBatchProcessor } from '../utils/batchProcessor.js';
import { vectorConfig } from '../config/vectorConfig.js';

/**
 * Vector search service for semantic document search
 * Extends BaseSearchService to eliminate code duplication
 */
class VectorSearchService extends BaseSearchService {
  
  constructor() {
    super({
      serviceName: 'VectorSearch',
      defaultLimit: 5,
      defaultThreshold: 0.3,
      cacheSize: 200,
      cacheTTL: 1800000, // 30 minutes
      cacheType: 'searchResults'
    });
    
    // Initialize batch processors for optimized performance
    this.embeddingBatchProcessor = createBatchProcessor.embeddings(embeddingService);
    this.chunkExpansionBatchProcessor = createBatchProcessor.chunkExpansion(this);
    this.databaseOptimizer = createBatchProcessor.databaseOptimizer(supabaseService);
  }
  
  /**
   * Main search method that routes to appropriate search function based on mode
   * @param {Object} searchParams - Search parameters
   * @param {string} searchParams.query - Search query
   * @param {string} searchParams.user_id - User ID for access control
   * @param {string} searchParams.group_id - Group ID (optional)
   * @param {Array<string>} searchParams.documentIds - Optional array of document IDs to filter search (for QA collections)
   * @param {number} searchParams.limit - Maximum results to return
   * @param {string} searchParams.mode - Search mode ('vector', 'hybrid', 'keyword')
   * @returns {Promise<Object>} Search results
   */
  async search(searchParams) {
    try {
      // Validate and sanitize all search parameters
      const validatedParams = InputValidator.validateSearchParams(searchParams);
      
      const { 
        query, 
        user_id, 
        group_id, 
        documentIds,
        limit, 
        mode,
        threshold
      } = validatedParams;

      console.log(`[VectorSearchService] Search request: query="${query}", mode="${mode}", user_id="${user_id}", documentIds=${documentIds ? `[${documentIds.length} docs]` : 'all'}`);

      // Route to appropriate search method based on mode
      switch (mode) {
        case 'hybrid':
          return await this.hybridSearch(query, user_id, { limit, threshold, documentIds });
        case 'keyword':
          return await this.fallbackKeywordSearch(query, user_id, limit, documentIds);
        case 'vector':
        default:
          // Use base class performSimilaritySearch with user document filters
          return await this.performSimilaritySearch({
            query,
            userId: user_id,
            filters: { documentIds, group_id },
            options: { 
              limit, 
              threshold, 
              useCache: true,
              useSmartExpansion: true
            }
          });
      }
    } catch (error) {
      return this.createErrorResponse(error, searchParams.query);
    }
  }

  /**
   * Generate query embedding with smart expansion support (overrides base class)
   * @param {string} query - Search query
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Query embedding
   * @protected
   */
  async generateQueryEmbedding(query, options = {}) {
    if (options.useSmartExpansion) {
      return await this.smartEnhanceAndEmbedQuery(query, options.userId || 'system');
    }
    
    return await embeddingService.generateQueryEmbedding(query);
  }

  /**
   * Get RPC function name based on filters (overrides base class)
   * @param {Object} filters - Search filters
   * @returns {string} RPC function name
   * @protected
   */
  getRPCFunction(filters) {
    if (filters.documentIds && filters.documentIds.length > 0) {
      return 'similarity_search_with_documents';
    }
    return 'similarity_search_optimized';
  }

  /**
   * Build RPC parameters (overrides base class)
   * @param {Object} params - Parameter object
   * @returns {Object} RPC parameters
   * @protected
   */
  buildRPCParams(params) {
    const { embeddingString, userId, filters, limit, threshold } = params;
    
    const baseParams = {
      query_embedding: embeddingString,
      user_id_filter: userId,
      similarity_threshold: threshold,
      match_count: limit
    };
    
    // Add document filtering if specified
    if (filters.documentIds && filters.documentIds.length > 0) {
      baseParams.document_ids_filter = filters.documentIds;
    }
    
    return baseParams;
  }

  /**
   * Handle empty search results with keyword fallback (overrides base class)
   * @param {string} query - Original query
   * @param {Object} options - Search options
   * @param {string} userId - User ID (passed from base class)
   * @returns {Object} Empty results response or keyword fallback results
   * @protected
   */
  async handleEmptyResults(query, options, userId = null) {
    if (options.includeKeywordFallback && userId) {
      console.log(`[VectorSearchService] No vector results found, trying keyword search`);
      return await this.fallbackKeywordSearch(query, userId, options.limit, options.filters?.documentIds);
    }
    
    return super.handleEmptyResults(query, options);
  }

  /**
   * Search documents using vector similarity (legacy method for backward compatibility)
   * @param {string} query - Search query
   * @param {string} userId - User ID for access control
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchDocuments(query, userId, options = {}) {
    // Convert legacy options to new format and use base class
    return await this.performSimilaritySearch({
      query,
      userId,
      filters: { documentIds: options.documentIds },
      options: {
        limit: options.limit || 5,
        threshold: options.threshold,
        useCache: true,
        useSmartExpansion: true,
        includeKeywordFallback: options.includeKeywordSearch !== false
      }
    });
  }

  /**
   * Search Grundsatz documents using specialized service
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results from Grundsatz documents
   */
  async searchGrundsatz(searchParams) {
    // Delegate to specialized Grundsatz search service
    return await grundsatzSearchService.searchGrundsatz(searchParams);
  }

  /**
   * Hybrid search combining vector similarity with BM25 keyword search
   * @param {string} query - Search query
   * @param {string} userId - User ID for access control
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Enhanced search results
   */
  async hybridSearch(query, userId, options = {}) {
    const {
      limit = 5,
      vectorWeight = 0.7,
      keywordWeight = 0.3,
      threshold = null,
      documentIds = null
    } = options;

    try {
      console.log(`[VectorSearchService] Starting hybrid search for: "${query}"`);

      // Run vector and keyword searches in parallel
      const [vectorResults, keywordResults] = await Promise.all([
        this.getVectorResults(query, userId, limit * 3, threshold, documentIds), // Get more for merging
        this.getBM25Results(query, userId, limit * 2, documentIds) // Get fewer keyword results
      ]);

      console.log(`[VectorSearchService] Vector results: ${vectorResults.length}, Keyword results: ${keywordResults.length}`);

      // Merge and deduplicate results
      const mergedResults = this.mergeSearchResults(vectorResults, keywordResults, vectorWeight, keywordWeight);

      // Sort by combined score and limit
      mergedResults.sort((a, b) => b.combined_score - a.combined_score);
      const finalResults = mergedResults.slice(0, limit);

      return {
        success: true,
        results: finalResults,
        query: query.trim(),
        searchType: 'hybrid',
        message: `Found ${finalResults.length} documents using hybrid search`,
        stats: {
          vectorResults: vectorResults.length,
          keywordResults: keywordResults.length,
          mergedResults: mergedResults.length
        }
      };

    } catch (error) {
      console.error('[VectorSearchService] Hybrid search error:', error);
      
      // Fallback to regular vector search
      return await this.searchDocuments(query, userId, { limit, threshold, documentIds });
    }
  }

  /**
   * Get vector similarity results
   * @private
   */
  async getVectorResults(query, userId, limit, threshold, documentIds = null) {
    try {
      const queryEmbedding = await this.smartEnhanceAndEmbedQuery(query, userId);
      const dynamicThreshold = threshold ?? this.calculateDynamicThreshold(query);
      const chunks = await this.findSimilarChunks(queryEmbedding, userId, limit, dynamicThreshold, documentIds);
      return await this.groupAndRankResults(chunks, limit);
    } catch (error) {
      console.warn('[VectorSearchService] Vector search failed in hybrid mode:', error);
      return [];
    }
  }

  /**
   * Get BM25 keyword search results
   * @private
   */
  async getBM25Results(query, userId, limit, documentIds = null) {
    try {
      // Use PostgreSQL's full-text search capabilities
      let queryBuilder = supabaseService
        .from('documents')
        .select('id, title, filename, ocr_text, created_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .textSearch('ocr_text', query, {
          type: 'websearch',
          config: 'german' // Use German text search configuration
        });
      
      // Add document ID filtering if provided
      if (documentIds && documentIds.length > 0) {
        queryBuilder = queryBuilder.in('id', documentIds);
      }
      
      const { data: documents, error } = await queryBuilder.limit(limit);

      if (error) {
        console.warn('[VectorSearchService] BM25 search failed:', error);
        return [];
      }

      return (documents || []).map(doc => ({
        document_id: doc.id,
        title: doc.title,
        filename: doc.filename,
        created_at: doc.created_at,
        relevant_content: this.extractRelevantTextAroundQuery(doc.ocr_text, query, 400),
        bm25_score: 1.0, // PostgreSQL doesn't return scores, so we use a placeholder
        search_type: 'keyword'
      }));

    } catch (error) {
      console.warn('[VectorSearchService] BM25 search failed:', error);
      return [];
    }
  }

  /**
   * Merge vector and keyword search results with weighted scoring
   * @private
   */
  mergeSearchResults(vectorResults, keywordResults, vectorWeight, keywordWeight) {
    const documentMap = new Map();

    // Add vector results
    vectorResults.forEach(result => {
      const docId = result.document_id;
      documentMap.set(docId, {
        ...result,
        vector_score: result.similarity_score || 0,
        keyword_score: 0,
        combined_score: (result.similarity_score || 0) * vectorWeight,
        search_sources: ['vector']
      });
    });

    // Merge keyword results
    keywordResults.forEach(result => {
      const docId = result.document_id;
      
      if (documentMap.has(docId)) {
        // Document found in both searches - combine scores
        const existing = documentMap.get(docId);
        existing.keyword_score = result.bm25_score || 0.5;
        existing.combined_score = (existing.vector_score * vectorWeight) + (existing.keyword_score * keywordWeight);
        existing.search_sources.push('keyword');
        
        // Use the longer relevant content
        if (result.relevant_content && result.relevant_content.length > existing.relevant_content.length) {
          existing.relevant_content = result.relevant_content;
        }
      } else {
        // Keyword-only result
        documentMap.set(docId, {
          ...result,
          vector_score: 0,
          keyword_score: result.bm25_score || 0.5,
          combined_score: (result.bm25_score || 0.5) * keywordWeight,
          search_sources: ['keyword'],
          similarity_score: null // No vector similarity
        });
      }
    });

    return Array.from(documentMap.values());
  }

  /**
   * Smart query enhancement using vector space navigation and document feedback
   * @param {string} originalQuery - Original search query  
   * @param {string} userId - User ID for personalized expansion
   * @returns {Promise<Array>} Enhanced query embedding
   * @private
   */
  async smartEnhanceAndEmbedQuery(originalQuery, userId) {
    try {
      // Use smart query expansion to get intelligently expanded queries
      const expansion = await smartQueryExpansion.expandQuery(originalQuery, userId);
      
      console.log(`[VectorSearchService] Smart expansion result:`, {
        original: expansion.originalQuery,
        expandedQueries: expansion.expandedQueries,
        expansionTerms: expansion.expansionTerms,
        sources: expansion.expansionSources
      });

      // If no expansion or fallback, use simple embedding
      if (expansion.fallback || expansion.expandedQueries.length <= 1) {
        console.log(`[VectorSearchService] Using simple embedding (no expansion available)`);
        return await embeddingService.generateQueryEmbedding(originalQuery);
      }

      // Generate embeddings for all expanded queries using batch processing (OPTIMIZED)
      console.log(`[VectorSearchService] Generating embeddings for ${expansion.expandedQueries.length} expanded queries using batch processing`);
      
      const embeddingResults = await this.embeddingBatchProcessor.generateEmbeddings(expansion.expandedQueries);
      
      // Process results and calculate weights using configuration
      const queryConfig = vectorConfig.get('queryExpansion');
      const embeddings = [];
      const weights = [];
      
      embeddingResults.forEach((result, i) => {
        if (result.embedding && result.embedding.length > 0) {
          embeddings.push(result.embedding);
          
          // Weight the original query higher, then decrease for expansions using config
          if (i === 0) {
            weights.push(queryConfig.originalWeight);
          } else {
            // Expansion queries get decreasing weights based on confidence
            const confidenceBoost = (expansion.semanticConfidence * queryConfig.semanticConfidenceWeight + 
                                   expansion.feedbackConfidence * queryConfig.feedbackConfidenceWeight) / 2;
            weights.push(queryConfig.expansionBaseWeight * confidenceBoost * queryConfig.confidenceBoostWeight);
          }
        } else {
          console.warn(`[VectorSearchService] Failed to generate embedding for: "${result.query}"`);
        }
      });

      if (embeddings.length === 0) {
        throw new Error('Failed to generate any embeddings for expanded queries');
      }

      // If only one embedding, return it directly
      if (embeddings.length === 1) {
        return embeddings[0];
      }

      // Calculate weighted average embedding
      const weightedEmbedding = this.calculateWeightedAverageEmbedding(embeddings, weights);
      
      console.log(`[VectorSearchService] Created smart weighted embedding from ${embeddings.length} variants`);
      return weightedEmbedding;

    } catch (error) {
      console.warn('[VectorSearchService] Smart expansion failed, using simple embedding:', error);
      // Fallback to simple embedding without expansion
      return await embeddingService.generateQueryEmbedding(originalQuery);
    }
  }


  /**
   * Calculate weighted average of multiple embeddings
   * @param {Array} embeddings - Array of embedding vectors
   * @param {Array} weights - Array of weights for each embedding
   * @returns {Array} Weighted average embedding
   * @private
   */
  calculateWeightedAverageEmbedding(embeddings, weights) {
    if (embeddings.length !== weights.length) {
      throw new Error('Embeddings and weights arrays must have same length');
    }

    const embeddingDim = embeddings[0].length;
    const weightedEmbedding = new Array(embeddingDim).fill(0);
    
    // Normalize weights
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = weights.map(w => w / totalWeight);
    
    // Calculate weighted sum
    for (let i = 0; i < embeddings.length; i++) {
      const weight = normalizedWeights[i];
      for (let j = 0; j < embeddingDim; j++) {
        weightedEmbedding[j] += embeddings[i][j] * weight;
      }
    }

    console.log(`[VectorSearchService] Calculated weighted average embedding from ${embeddings.length} variants`);
    return weightedEmbedding;
  }

  /**
   * Calculate dynamic similarity threshold based on query characteristics
   * @param {string} query - Search query
   * @returns {number} Calculated threshold between 0.2 and 0.8
   * @private
   */
  calculateDynamicThreshold(query) {
    const baseThreshold = 0.3;
    const queryWords = query.trim().split(/\s+/);
    const queryLength = queryWords.length;
    
    // Query length adjustment: shorter queries need lower thresholds for better recall
    let lengthAdjustment = 0;
    if (queryLength === 1) {
      lengthAdjustment = 0.0; // Single word queries - keep base threshold for better recall
    } else if (queryLength === 2) {
      lengthAdjustment = 0.05; // Two word queries get slight boost
    } else if (queryLength >= 5) {
      lengthAdjustment = -0.1; // Longer queries can be more permissive
    }
    
    // No hardcoded content type adjustments - rely on dynamic calculation only
    const contentAdjustment = 0;
    
    // Calculate final threshold
    const finalThreshold = baseThreshold + lengthAdjustment + contentAdjustment;
    
    // Clamp between 0.2 and 0.8
    const clampedThreshold = Math.max(0.2, Math.min(0.8, finalThreshold));
    
    console.log(`[VectorSearchService] Dynamic threshold calculation:`, {
      query: query,
      queryLength: queryLength,
      baseThreshold: baseThreshold,
      lengthAdjustment: lengthAdjustment,
      contentAdjustment: contentAdjustment,
      finalThreshold: clampedThreshold
    });
    
    return clampedThreshold;
  }

  /**
   * Find similar document chunks using vector similarity
   * @private
   */
  async findSimilarChunks(queryEmbedding, userId, limit, threshold, documentIds = null) {
    try {
      // Secure embedding validation and sanitization
      const embeddingString = InputValidator.validateEmbedding(queryEmbedding);
      
      // Validate other parameters
      const validUserId = InputValidator.validateUserId(userId);
      const validLimit = InputValidator.validateNumber(limit, 'limit', { min: 1, max: 100 });
      const validThreshold = InputValidator.validateNumber(threshold, 'threshold', { min: 0, max: 1 });
      
      let validDocumentIds = null;
      if (documentIds && documentIds.length > 0) {
        validDocumentIds = InputValidator.validateDocumentIds(documentIds);
      }
      
      console.log(`[VectorSearchService] Calling similarity_search with threshold: ${validThreshold}, documentIds: ${validDocumentIds ? `[${validDocumentIds.length} docs]` : 'all'}`);
      
      let chunks, error;
      
      if (validDocumentIds && validDocumentIds.length > 0) {
        // Use document-filtered search for QA collections
        console.log(`[VectorSearchService] Document-filtered search parameters:`, {
          user_id_filter: validUserId,
          document_ids_filter: validDocumentIds,
          similarity_threshold: validThreshold,
          match_count: validLimit,
          embedding_length: queryEmbedding.length
        });
        
        const result = await supabaseService
          .rpc('similarity_search_with_documents', {
            query_embedding: embeddingString,
            user_id_filter: validUserId,
            document_ids_filter: validDocumentIds,
            similarity_threshold: validThreshold,
            match_count: validLimit
          });
        chunks = result.data;
        error = result.error;
        
        console.log(`[VectorSearchService] Document-filtered search result:`, {
          chunks_count: chunks?.length || 0,
          error: error?.message || 'none'
        });
      } else {
        // Use regular search for all user documents
        const result = await supabaseService
          .rpc('similarity_search_optimized', {
            query_embedding: embeddingString,
            user_id_filter: validUserId,
            similarity_threshold: validThreshold,
            match_count: validLimit
          });
        chunks = result.data;
        error = result.error;
      }

      if (error) {
        console.error('[VectorSearchService] RPC error:', error);
        throw new Error(`Vector search RPC failed: ${error.message}`);
      }

      // Transform the results to match expected format
      const transformedChunks = (chunks || []).map(chunk => ({
        id: chunk.id,
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        chunk_text: chunk.chunk_text,
        embedding: chunk.embedding,
        token_count: chunk.token_count,
        created_at: chunk.created_at,
        similarity: chunk.similarity,
        documents: {
          id: chunk.document_id,
          title: chunk.document_title,
          filename: chunk.document_filename,
          created_at: chunk.document_created_at
        }
      }));

      console.log(`[VectorSearchService] Found ${transformedChunks.length} similar chunks`);
      return transformedChunks;
      
    } catch (error) {
      console.error('[VectorSearchService] Find similar chunks error:', error);
      throw error;
    }
  }

  /**
   * Group chunks by document and calculate aggregate scores
   * @private
   */
  async groupAndRankResults(chunks, limit) {
    const documentMap = new Map();

    // Group chunks by document
    for (const chunk of chunks) {
      const docId = chunk.documents.id;
      
      if (!documentMap.has(docId)) {
        documentMap.set(docId, {
          document_id: docId,
          title: chunk.documents.title,
          filename: chunk.documents.filename,
          created_at: chunk.documents.created_at,
          chunks: [],
          maxSimilarity: 0,
          avgSimilarity: 0
        });
      }

      const docData = documentMap.get(docId);
      docData.chunks.push({
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        text: chunk.chunk_text,
        similarity: chunk.similarity || 0,
        token_count: chunk.token_count
      });

      // Update max similarity
      if (chunk.similarity > docData.maxSimilarity) {
        docData.maxSimilarity = chunk.similarity;
      }
    }

    // Calculate enhanced scores and format results
    const results = Array.from(documentMap.values()).map(doc => {
      // Sort chunks by similarity first
      doc.chunks.sort((a, b) => b.similarity - a.similarity);
      
      // Calculate enhanced document score
      const enhancedScore = this.calculateEnhancedDocumentScore(doc.chunks);
      
      // Take top 3 most relevant chunks per document
      const topChunks = doc.chunks.slice(0, 3);
      
      // Create combined relevant text
      const relevantContent = topChunks
        .map(chunk => this.extractRelevantExcerpt(chunk.text, 300))
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
        chunk_count: doc.chunks.length,
        relevance_info: `Found ${doc.chunks.length} relevant sections in "${doc.title}" (diversity: +${(enhancedScore.diversityBonus * 100).toFixed(1)}%)`
      };
    });

    // Sort by enhanced final score and return top results
    results.sort((a, b) => b.similarity_score - a.similarity_score);
    
    return results.slice(0, limit);
  }

  /**
   * Calculate enhanced document score with position weighting and diversity bonus
   * @param {Array} chunks - Array of document chunks with similarity scores
   * @returns {Object} Enhanced scoring metrics
   * @private
   */
  calculateEnhancedDocumentScore(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        finalScore: 0,
        maxSimilarity: 0,
        avgSimilarity: 0,
        positionScore: 0,
        diversityBonus: 0
      };
    }

    const similarities = chunks.map(c => c.similarity);
    const maxSimilarity = Math.max(...similarities);
    const avgSimilarity = similarities.reduce((a, b) => a + b) / similarities.length;
    
    // Position-aware scoring: earlier chunks get bonus (assuming chunk_index represents document position)
    let positionScore = 0;
    chunks.forEach((chunk, idx) => {
      // Position weight decreases as chunk_index increases (later in document)
      const positionWeight = Math.max(0.3, 1 - (chunk.chunk_index * 0.1));
      positionScore += chunk.similarity * positionWeight;
    });
    positionScore = positionScore / chunks.length;
    
    // Diversity bonus: reward documents with multiple relevant chunks
    // More chunks = better coverage, but with diminishing returns
    const diversityBonus = Math.min(0.2, chunks.length * 0.05);
    
    // Weighted final score:
    // - Max similarity (50%): Best match quality
    // - Avg similarity (30%): Overall relevance
    // - Position score (20%): Earlier chunks are more important
    // - Diversity bonus: Added bonus for multiple relevant sections
    const finalScore = (maxSimilarity * 0.5) + 
                      (avgSimilarity * 0.3) + 
                      (positionScore * 0.2) + 
                      diversityBonus;
    
    return {
      finalScore: Math.min(1.0, finalScore), // Cap at 1.0
      maxSimilarity,
      avgSimilarity,
      positionScore,
      diversityBonus
    };
  }

  /**
   * Extract relevant excerpt from chunk text
   * @private
   */
  extractRelevantExcerpt(text, maxLength = 300) {
    if (!text || text.length <= maxLength) {
      return text;
    }

    // Try to cut at sentence boundary
    const truncated = text.substring(0, maxLength);
    const lastSentence = truncated.lastIndexOf('.');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastExclamation = truncated.lastIndexOf('!');
    
    const lastPunctuation = Math.max(lastSentence, lastQuestion, lastExclamation);
    
    if (lastPunctuation > maxLength * 0.7) {
      return truncated.substring(0, lastPunctuation + 1);
    }
    
    return truncated + '...';
  }

  /**
   * Fallback to keyword search when vector search fails or returns no results
   * @private
   */
  async fallbackKeywordSearch(query, userId, limit, documentIds = null) {
    try {
      console.log(`[VectorSearchService] Performing keyword search fallback for: "${query}", documentIds: ${documentIds ? `[${documentIds.length} docs]` : 'all'}`);
      
      let queryBuilder = supabaseService
        .from('documents')
        .select('id, title, filename, ocr_text, created_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .ilike('ocr_text', `%${query.trim()}%`);
      
      // Add document ID filtering if provided
      if (documentIds && documentIds.length > 0) {
        queryBuilder = queryBuilder.in('id', documentIds);
      }
      
      const { data: documents, error } = await queryBuilder.limit(limit);

      if (error) {
        throw new Error(`Keyword search failed: ${error.message}`);
      }

      const results = (documents || []).map(doc => ({
        document_id: doc.id,
        title: doc.title,
        filename: doc.filename,
        created_at: doc.created_at,
        relevant_content: this.extractRelevantTextAroundQuery(doc.ocr_text, query, 500),
        similarity_score: null,
        relevance_info: `Text match found in "${doc.title}"`
      }));

      return {
        success: true,
        results,
        query: query.trim(),
        searchType: 'keyword_fallback',
        message: `Found ${results.length} document(s) using keyword search`
      };

    } catch (error) {
      console.error('[VectorSearchService] Keyword search fallback failed:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        query: query.trim(),
        searchType: 'fallback_error'
      };
    }
  }

  /**
   * Extract text around query matches for keyword search
   * @private
   */
  extractRelevantTextAroundQuery(text, query, maxLength = 500) {
    if (!text) return '';
    
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    const index = textLower.indexOf(queryLower);
    
    if (index === -1) {
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
   * Search Grundsatz documents using vector similarity
   * @param {Object} searchParams - Search parameters
   * @param {string} searchParams.query - Search query
   * @param {string} searchParams.user_id - User ID (for logging)
   * @param {number} searchParams.limit - Maximum results to return
   * @param {string} searchParams.mode - Search mode ('vector', 'hybrid', 'keyword')
   * @returns {Promise<Object>} Search results from Grundsatz documents
   */
  async searchGrundsatz(searchParams) {
    const { 
      query, 
      user_id, 
      limit = 5, 
      mode = 'vector',
      threshold = null
    } = searchParams;

    console.log(`[VectorSearchService] Grundsatz search request: query="${query}", mode="${mode}", user_id="${user_id}"`);

    try {
      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateQueryEmbedding(query);
      
      if (!embeddingService.validateEmbedding(queryEmbedding)) {
        throw new Error('Invalid query embedding generated for Grundsatz search');
      }

      // Calculate dynamic threshold if not provided
      const dynamicThreshold = threshold ?? this.calculateDynamicThreshold(query);
      console.log(`[VectorSearchService] Using Grundsatz similarity threshold: ${dynamicThreshold}`);

      // Search Grundsatz document chunks
      const chunks = await this.findSimilarGrundsatzChunks(queryEmbedding, limit * 3, dynamicThreshold);
      
      if (chunks.length === 0) {
        console.log(`[VectorSearchService] No Grundsatz vector results found`);
        
        return {
          success: true,
          results: [],
          query: query.trim(),
          searchType: 'grundsatz_vector',
          message: 'No relevant documents found in Grundsatzprogramme'
        };
      }

      // Group chunks by document and rank
      const documentResults = await this.groupAndRankGrundsatzResults(chunks, limit);

      console.log(`[VectorSearchService] Found ${documentResults.length} relevant Grundsatz documents`);

      return {
        success: true,
        results: documentResults,
        query: query.trim(),
        searchType: 'grundsatz_vector',
        message: `Found ${documentResults.length} relevant document(s) from Grundsatzprogramme`
      };

    } catch (error) {
      console.error('[VectorSearchService] Grundsatz search error:', error);
      
      return {
        success: false,
        error: error.message,
        results: [],
        query: query.trim(),
        searchType: 'grundsatz_error'
      };
    }
  }

  /**
   * Find similar Grundsatz document chunks using vector similarity
   * @private
   */
  async findSimilarGrundsatzChunks(queryEmbedding, limit, threshold) {
    try {
      // Secure embedding validation and sanitization
      const embeddingString = InputValidator.validateEmbedding(queryEmbedding);
      const validLimit = InputValidator.validateNumber(limit, 'limit', { min: 1, max: 100 });
      const validThreshold = InputValidator.validateNumber(threshold, 'threshold', { min: 0, max: 1 });
      
      console.log(`[VectorSearchService] Calling Grundsatz similarity_search with threshold: ${validThreshold}`);
      
      // Call the RPC function specifically for Grundsatz documents
      const { data: chunks, error } = await supabaseService
        .rpc('similarity_search_grundsatz', {
          query_embedding: embeddingString,
          similarity_threshold: validThreshold,
          match_count: validLimit
        });

      if (error) {
        console.error('[VectorSearchService] Grundsatz RPC error:', error);
        throw new Error(`Grundsatz vector search RPC failed: ${error.message}`);
      }

      // Transform the results to match expected format
      const transformedChunks = (chunks || []).map(chunk => ({
        id: chunk.id,
        document_id: chunk.document_id,
        chunk_index: chunk.chunk_index,
        chunk_text: chunk.chunk_text,
        embedding: chunk.embedding,
        token_count: chunk.token_count,
        created_at: chunk.created_at,
        similarity: chunk.similarity,
        documents: {
          id: chunk.document_id,
          title: chunk.document_title,
          filename: chunk.document_filename,
          created_at: chunk.document_created_at
        }
      }));

      console.log(`[VectorSearchService] Found ${transformedChunks.length} similar Grundsatz chunks`);
      return transformedChunks;
      
    } catch (error) {
      console.error('[VectorSearchService] Find similar Grundsatz chunks error:', error);
      throw error;
    }
  }

  /**
   * Group Grundsatz chunks by document and calculate aggregate scores
   * @private
   */
  async groupAndRankGrundsatzResults(chunks, limit) {
    const documentMap = new Map();

    // Group chunks by document
    for (const chunk of chunks) {
      const docId = chunk.documents.id;
      
      if (!documentMap.has(docId)) {
        documentMap.set(docId, {
          document_id: docId,
          title: chunk.documents.title,
          filename: chunk.documents.filename,
          created_at: chunk.documents.created_at,
          chunks: [],
          maxSimilarity: 0,
          avgSimilarity: 0
        });
      }

      const docData = documentMap.get(docId);
      docData.chunks.push({
        chunk_id: chunk.id,
        chunk_index: chunk.chunk_index,
        text: chunk.chunk_text,
        similarity: chunk.similarity || 0,
        token_count: chunk.token_count
      });

      // Update max similarity
      if (chunk.similarity > docData.maxSimilarity) {
        docData.maxSimilarity = chunk.similarity;
      }
    }

    // Calculate enhanced scores and format results
    const results = Array.from(documentMap.values()).map(doc => {
      // Sort chunks by similarity first
      doc.chunks.sort((a, b) => b.similarity - a.similarity);
      
      // Calculate enhanced document score
      const enhancedScore = this.calculateEnhancedDocumentScore(doc.chunks);
      
      // Take top 3 most relevant chunks per document
      const topChunks = doc.chunks.slice(0, 3);
      
      // Create combined relevant text
      const relevantContent = topChunks
        .map(chunk => this.extractRelevantExcerpt(chunk.text, 300))
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
        chunk_count: doc.chunks.length,
        relevance_info: `Found ${doc.chunks.length} relevant sections in "${doc.title}" (Grundsatzprogramm)`
      };
    });

    // Sort by enhanced final score and return top results
    results.sort((a, b) => b.similarity_score - a.similarity_score);
    
    return results.slice(0, limit);
  }

  /**
   * Expand chunks with hierarchical context based on metadata (OPTIMIZED with batching)
   * @param {Array} chunks - Array of chunks to expand
   * @param {Object} options - Expansion options
   * @returns {Promise<Array>} Expanded chunks with context
   */
  async expandChunksWithContext(chunks, options = {}) {
    if (!chunks || chunks.length === 0) {
      return [];
    }

    // Use centralized configuration for context expansion
    const contextConfig = vectorConfig.get('contextExpansion');
    const expandOptions = {
      maxContextTokens: options.maxContextTokens || contextConfig.maxContextTokens,
      includePrevious: options.includePrevious !== false && contextConfig.includePrevious,
      includeNext: options.includeNext !== false && contextConfig.includeNext,
      includeRelated: options.includeRelated !== false && contextConfig.includeRelated,
      preserveStructure: options.preserveStructure !== false && contextConfig.preserveStructure
    };

    console.log(`[VectorSearchService] Expanding ${chunks.length} chunks with context using batch processing`);

    // Use batch processor for optimized performance
    return await this.chunkExpansionBatchProcessor.expandChunks(chunks, expandOptions);
  }

  /**
   * Expand a single chunk with hierarchical context
   * @private
   */
  async expandSingleChunk(chunk, options) {
    const { maxContextTokens, includePrevious, includeNext, includeRelated, preserveStructure } = options;
    
    // Get chunk metadata
    const { data: chunkWithMetadata, error } = await supabaseService
      .from('document_chunks')
      .select('*, metadata')
      .eq('id', chunk.id)
      .single();

    if (error || !chunkWithMetadata) {
      console.warn(`[VectorSearchService] Could not get metadata for chunk ${chunk.id}`);
      return chunk;
    }

    const metadata = chunkWithMetadata.metadata || {};
    let contextChunks = [chunkWithMetadata];
    let totalTokens = chunkWithMetadata.token_count || 0;

    // Add previous chunk if available and within token limit
    if (includePrevious && metadata.previous_chunk && totalTokens < maxContextTokens * 0.8) {
      try {
        const previousChunk = await this.getChunkById(metadata.previous_chunk);
        if (previousChunk && (totalTokens + previousChunk.token_count) <= maxContextTokens) {
          contextChunks.unshift(previousChunk);
          totalTokens += previousChunk.token_count;
        }
      } catch (error) {
        console.debug(`[VectorSearchService] Could not fetch previous chunk: ${error.message}`);
      }
    }

    // Add next chunk if available and within token limit
    if (includeNext && metadata.next_chunk && totalTokens < maxContextTokens * 0.8) {
      try {
        const nextChunk = await this.getChunkById(metadata.next_chunk);
        if (nextChunk && (totalTokens + nextChunk.token_count) <= maxContextTokens) {
          contextChunks.push(nextChunk);
          totalTokens += nextChunk.token_count;
        }
      } catch (error) {
        console.debug(`[VectorSearchService] Could not fetch next chunk: ${error.message}`);
      }
    }

    // Add related chunks from same section if specified
    if (includeRelated && metadata.related_chunks && totalTokens < maxContextTokens * 0.9) {
      const relatedChunkIds = metadata.related_chunks
        .filter(rel => rel.relationship === 'same_section' && rel.strength > 0.8)
        .slice(0, 2) // Limit to 2 most related chunks
        .map(rel => rel.chunk_index);

      for (const relatedId of relatedChunkIds) {
        if (totalTokens >= maxContextTokens) break;
        
        try {
          const relatedChunk = await this.getChunkById(relatedId);
          if (relatedChunk && (totalTokens + relatedChunk.token_count) <= maxContextTokens) {
            // Avoid duplicates
            if (!contextChunks.find(c => c.id === relatedChunk.id)) {
              contextChunks.push(relatedChunk);
              totalTokens += relatedChunk.token_count;
            }
          }
        } catch (error) {
          console.debug(`[VectorSearchService] Could not fetch related chunk: ${error.message}`);
        }
      }
    }

    // Build expanded content
    const expandedContent = this.buildExpandedContent(contextChunks, chunk, metadata, preserveStructure);

    return {
      ...chunk,
      expanded_content: expandedContent,
      context_metadata: {
        original_chunk_id: chunk.id,
        context_chunks_count: contextChunks.length,
        total_tokens: totalTokens,
        section_title: metadata.section_title,
        chapter_title: metadata.chapter_title,
        chunk_type: metadata.chunk_type,
        expansion_method: 'hierarchical'
      }
    };
  }

  /**
   * Get chunk by ID with metadata
   * @private
   */
  async getChunkById(chunkId) {
    const { data, error } = await supabaseService
      .from('document_chunks')
      .select('*')
      .eq('chunk_index', chunkId) // Note: using chunk_index as the identifier
      .single();

    if (error) {
      throw new Error(`Failed to fetch chunk ${chunkId}: ${error.message}`);
    }

    return data;
  }

  /**
   * Build expanded content with structure preservation
   * @private
   */
  buildExpandedContent(contextChunks, originalChunk, metadata, preserveStructure) {
    if (!preserveStructure || contextChunks.length === 1) {
      return contextChunks.map(c => c.chunk_text).join('\n\n');
    }

    // Build structured content with headers
    let expandedText = '';

    // Add document/section context if available
    if (metadata.chapter_title) {
      expandedText += `# ${metadata.chapter_title}\n\n`;
    }
    if (metadata.section_title && metadata.section_title !== metadata.chapter_title) {
      expandedText += `## ${metadata.section_title}\n\n`;
    }

    // Add chunks with indicators
    contextChunks.forEach((chunk, index) => {
      const isOriginal = chunk.id === originalChunk.id;
      
      if (isOriginal) {
        expandedText += `**[RELEVANT SECTION]**\n${chunk.chunk_text}\n\n`;
      } else {
        const position = index < contextChunks.findIndex(c => c.id === originalChunk.id) ? 'CONTEXT BEFORE' : 'CONTEXT AFTER';
        expandedText += `[${position}]\n${chunk.chunk_text}\n\n`;
      }
    });

    return expandedText.trim();
  }

  /**
   * Search with automatic context expansion
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results with expanded context
   */
  async searchWithContext(searchParams) {
    const { 
      expandContext = true,
      contextOptions = {},
      ...baseSearchParams 
    } = searchParams;

    // Perform base search
    const baseResults = await this.search(baseSearchParams);

    if (!expandContext || !baseResults.success || baseResults.results.length === 0) {
      return baseResults;
    }

    console.log(`[VectorSearchService] Expanding context for ${baseResults.results.length} results`);

    // Extract chunks from results (if they have chunk information)
    const chunksToExpand = [];
    baseResults.results.forEach(result => {
      if (result.chunks) {
        // Multi-chunk result
        result.chunks.forEach(chunk => chunksToExpand.push({
          id: chunk.chunk_id,
          document_id: result.document_id,
          chunk_index: chunk.chunk_index,
          chunk_text: chunk.text,
          similarity: chunk.similarity,
          token_count: chunk.token_count
        }));
      } else {
        // Single result - try to find associated chunks
        // This is a simplified approach - in practice you might need to query chunks
        chunksToExpand.push({
          id: `${result.document_id}_0`, // Placeholder
          document_id: result.document_id,
          chunk_text: result.relevant_content,
          similarity: result.similarity_score
        });
      }
    });

    // Expand chunks with context
    const expandedChunks = await this.expandChunksWithContext(chunksToExpand, contextOptions);

    // Merge expanded content back into results
    const enhancedResults = baseResults.results.map(result => {
      const relatedExpandedChunks = expandedChunks.filter(chunk => 
        chunk.document_id === result.document_id
      );

      if (relatedExpandedChunks.length > 0) {
        // Use expanded content
        const expandedContent = relatedExpandedChunks
          .map(chunk => chunk.expanded_content || chunk.chunk_text)
          .join('\n\n--- \n\n');

        return {
          ...result,
          relevant_content: expandedContent,
          context_expanded: true,
          context_metadata: relatedExpandedChunks[0]?.context_metadata
        };
      }

      return result;
    });

    return {
      ...baseResults,
      results: enhancedResults,
      context_expanded: true
    };
  }

  /**
   * Check if a document has embeddings generated
   */
  async hasEmbeddings(documentId) {
    const { data, error } = await supabaseService
      .from('document_chunks')
      .select('id')
      .eq('document_id', documentId)
      .limit(1);

    if (error) {
      console.error('[VectorSearchService] Error checking embeddings:', error);
      return false;
    }

    return data && data.length > 0;
  }

  /**
   * Get document statistics
   */
  async getDocumentStats(userId) {
    try {
      const { data: totalDocs, error: totalError } = await supabaseService
        .from('documents')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'completed');

      const { data: embeddedDocs, error: embeddedError } = await supabaseService
        .from('documents')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .in('id', 
          supabaseService
            .from('document_chunks')
            .select('document_id')
        );

      if (totalError || embeddedError) {
        throw new Error('Failed to get document statistics');
      }

      return {
        totalDocuments: totalDocs?.length || 0,
        documentsWithEmbeddings: embeddedDocs?.length || 0
      };
    } catch (error) {
      console.error('[VectorSearchService] Error getting stats:', error);
      return { totalDocuments: 0, documentsWithEmbeddings: 0 };
    }
  }

  /**
   * Search database examples using vector similarity
   * @param {string} query - Search query text
   * @param {string} contentType - Type of content to search (e.g., 'instagram')
   * @param {number} limit - Maximum results to return
   * @param {number} threshold - Similarity threshold (0-1)
   * @returns {Promise<Object>} Search results with similarity scores
   */
  async searchDatabaseExamples(query, contentType, limit = 5, threshold = 0.3) {
    try {
      // Validate input parameters
      const validQuery = InputValidator.validateSearchQuery(query);
      const validContentType = InputValidator.validateContentType(contentType);
      const validLimit = InputValidator.validateNumber(limit, 'limit', { min: 1, max: 100 });
      const validThreshold = InputValidator.validateNumber(threshold, 'threshold', { min: 0, max: 1 });
      
      console.log(`[VectorSearchService] Searching database examples: "${validQuery}" for type: ${validContentType}`);

      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateQueryEmbedding(validQuery);
      
      if (!embeddingService.validateEmbedding(queryEmbedding)) {
        throw new Error('Invalid query embedding generated');
      }

      // Secure embedding validation and conversion
      const embeddingString = InputValidator.validateEmbedding(queryEmbedding);
      
      const { data: examples, error } = await supabaseService
        .rpc('similarity_search_database_examples', {
          query_embedding: embeddingString,
          content_type_filter: validContentType,
          similarity_threshold: validThreshold,
          match_count: validLimit
        });

      if (error) {
        console.error('[VectorSearchService] Database examples search error:', error);
        throw new Error(`Database examples search failed: ${error.message}`);
      }

      // Transform results to include similarity score
      const results = (examples || []).map(example => ({
        ...example,
        similarity_score: example.similarity || 0
      }));

      console.log(`[VectorSearchService] Found ${results.length} similar examples with scores:`,
        results.map(r => ({ title: r.title?.substring(0, 50) + '...', score: r.similarity_score?.toFixed(3) })));

      return {
        success: true,
        results: results
      };

    } catch (error) {
      console.error('[VectorSearchService] searchDatabaseExamples error:', error);
      return {
        success: false,
        error: error.message,
        results: []
      };
    }
  }
}


// Export singleton instance
export const vectorSearchService = new VectorSearchService();