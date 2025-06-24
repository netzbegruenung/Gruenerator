import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from './embeddingService.js';
import { smartQueryExpansion } from './smartQueryExpansion.js';

/**
 * Vector search service for semantic document search
 */
class VectorSearchService {
  
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
    const { 
      query, 
      user_id, 
      group_id, 
      documentIds,
      limit = 5, 
      mode = 'vector',
      threshold = null
    } = searchParams;

    console.log(`[VectorSearchService] Search request: query="${query}", mode="${mode}", user_id="${user_id}", documentIds=${documentIds ? `[${documentIds.length} docs]` : 'all'}`);

    // Route to appropriate search method based on mode
    switch (mode) {
      case 'hybrid':
        return await this.hybridSearch(query, user_id, { limit, threshold, documentIds });
      case 'keyword':
        return await this.fallbackKeywordSearch(query, user_id, limit, documentIds);
      case 'vector':
      default:
        return await this.searchDocuments(query, user_id, { limit, threshold, documentIds });
    }
  }

  /**
   * Search documents using vector similarity
   * @param {string} query - Search query
   * @param {string} userId - User ID for access control
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async searchDocuments(query, userId, options = {}) {
    const {
      limit = 5,
      threshold = null, // Will be calculated dynamically if not provided
      includeKeywordSearch = true,
      documentIds = null
    } = options;

    try {
      console.log(`[VectorSearchService] Searching for: "${query}" (user: ${userId})`);

      // Generate enhanced embedding for the query using smart expansion
      console.log(`[VectorSearchService] Processing and generating embedding for query: "${query}"`);
      const queryEmbedding = await this.smartEnhanceAndEmbedQuery(query, userId);
      
      console.log(`[VectorSearchService] Generated embedding dimensions: ${queryEmbedding?.length}`);
      console.log(`[VectorSearchService] First 5 embedding values: ${queryEmbedding?.slice(0, 5)}`);
      
      if (!embeddingService.validateEmbedding(queryEmbedding)) {
        throw new Error('Invalid query embedding generated');
      }

      // Calculate dynamic threshold if not provided
      const dynamicThreshold = threshold ?? this.calculateDynamicThreshold(query);
      console.log(`[VectorSearchService] Using similarity threshold: ${dynamicThreshold}`);

      // Search for similar document chunks
      const chunks = await this.findSimilarChunks(queryEmbedding, userId, limit * 3, dynamicThreshold, documentIds);
      
      if (chunks.length === 0) {
        console.log(`[VectorSearchService] No vector results found, ${includeKeywordSearch ? 'trying keyword search' : 'returning empty'}`);
        
        if (includeKeywordSearch) {
          return await this.fallbackKeywordSearch(query, userId, limit, documentIds);
        }
        
        return {
          success: true,
          results: [],
          query: query.trim(),
          searchType: 'vector',
          message: 'No relevant documents found'
        };
      }

      // Group chunks by document and rank
      const documentResults = await this.groupAndRankResults(chunks, limit);

      console.log(`[VectorSearchService] Found ${documentResults.length} relevant documents`);

      return {
        success: true,
        results: documentResults,
        query: query.trim(),
        searchType: 'vector',
        message: `Found ${documentResults.length} relevant document(s)`
      };

    } catch (error) {
      console.error('[VectorSearchService] Search error:', error);
      
      // Fallback to keyword search on error
      if (includeKeywordSearch) {
        console.log('[VectorSearchService] Falling back to keyword search due to error');
        return await this.fallbackKeywordSearch(query, userId, limit, documentIds);
      }
      
      return {
        success: false,
        error: error.message,
        results: [],
        query: query.trim(),
        searchType: 'error'
      };
    }
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

      // Generate embeddings for all expanded queries
      const embeddings = [];
      const weights = [];
      
      for (let i = 0; i < expansion.expandedQueries.length; i++) {
        const query = expansion.expandedQueries[i];
        try {
          const embedding = await embeddingService.generateQueryEmbedding(query);
          embeddings.push(embedding);
          
          // Weight the original query higher, then decrease for expansions
          if (i === 0) {
            weights.push(1.0); // Original query gets full weight
          } else {
            // Expansion queries get decreasing weights based on confidence
            const baseWeight = 0.6;
            const confidenceBoost = (expansion.semanticConfidence + expansion.feedbackConfidence) / 2;
            weights.push(baseWeight * confidenceBoost);
          }
        } catch (error) {
          console.warn(`[VectorSearchService] Failed to generate embedding for: "${query}"`, error);
        }
      }

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
      console.warn('[VectorSearchService] Smart expansion failed, using fallback:', error);
      // Fallback to old hardcoded method
      return await this.enhanceAndEmbedQuery(originalQuery);
    }
  }

  /**
   * Legacy: Enhance query with German political synonyms and generate weighted embedding
   * @param {string} originalQuery - Original search query
   * @returns {Promise<Array>} Enhanced query embedding
   * @private
   */
  async enhanceAndEmbedQuery(originalQuery) {
    // German political synonyms and semantic expansions
    const germanSynonyms = {
      'umwelt': ['klimaschutz', 'nachhaltigkeit', 'ökologie', 'naturschutz'],
      'klimaschutz': ['umwelt', 'nachhaltigkeit', 'co2', 'emission'],
      'bildung': ['schule', 'universität', 'ausbildung', 'lernen', 'lehren'],
      'wirtschaft': ['finanzen', 'arbeitsplätze', 'unternehmen', 'arbeit'],
      'sozial': ['gesellschaft', 'gemeinschaft', 'solidarität', 'gerechtigkeit'],
      'energie': ['strom', 'erneuerbar', 'solar', 'wind', 'photovoltaik'],
      'verkehr': ['mobilität', 'transport', 'öpnv', 'bahn', 'fahrrad'],
      'wohnen': ['miete', 'bauen', 'stadt', 'quartier', 'sozialwohnung'],
      'gesundheit': ['medizin', 'pflege', 'krankenhaus', 'vorsorge'],
      'europa': ['eu', 'europäisch', 'international', 'grenzüberschreitend'],
      'essen': ['ernährung', 'landwirtschaft', 'lebensmittel', 'nahrung'],
      'ernährung': ['essen', 'landwirtschaft', 'lebensmittel', 'gesundheit'],
      'landwirtschaft': ['ernährung', 'essen', 'bauern', 'agrar', 'lebensmittel'],
      'lebensmittel': ['essen', 'ernährung', 'landwirtschaft', 'qualität']
    };

    // Create query variants
    const queryVariants = [originalQuery];
    const queryLower = originalQuery.toLowerCase();
    
    // Add semantic expansions for recognized terms
    Object.entries(germanSynonyms).forEach(([term, synonyms]) => {
      if (queryLower.includes(term)) {
        // Add the most relevant synonym
        if (synonyms.length > 0) {
          const expandedQuery = `${originalQuery} ${synonyms[0]}`;
          queryVariants.push(expandedQuery);
        }
      }
    });

    // Add specific political context if query seems policy-related
    const politicalTerms = ['politik', 'partei', 'wahl', 'bundestag', 'regierung', 'minister', 'grün', 'grüne'];
    const isPolitical = politicalTerms.some(term => queryLower.includes(term));
    
    if (isPolitical && !queryLower.includes('grün')) {
      queryVariants.push(`${originalQuery} grüne politik`);
    }

    console.log(`[VectorSearchService] Query variants:`, queryVariants);

    // Generate embeddings for all variants
    const embeddings = [];
    const weights = [1.0]; // Original query gets full weight
    
    for (let i = 0; i < queryVariants.length; i++) {
      try {
        const embedding = await embeddingService.generateQueryEmbedding(queryVariants[i]);
        embeddings.push(embedding);
        
        // Assign decreasing weights to expanded queries
        if (i > 0) {
          weights.push(Math.max(0.3, 0.8 - (i - 1) * 0.2));
        }
      } catch (error) {
        console.warn(`[VectorSearchService] Failed to generate embedding for variant: "${queryVariants[i]}"`, error);
      }
    }

    if (embeddings.length === 0) {
      throw new Error('Failed to generate any query embeddings');
    }

    // If only one embedding (original), return it
    if (embeddings.length === 1) {
      return embeddings[0];
    }

    // Calculate weighted average embedding
    return this.calculateWeightedAverageEmbedding(embeddings, weights);
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
    
    // Content type adjustment: German political terms
    let contentAdjustment = 0;
    const politicalTerms = ['politik', 'partei', 'wahl', 'bundestag', 'regierung', 'minister', 'grün', 'grüne', 'umwelt', 'klima', 'energie', 'bildung', 'sozial', 'essen', 'ernährung', 'landwirtschaft', 'lebensmittel'];
    const queryLower = query.toLowerCase();
    const hasPoliticalTerms = politicalTerms.some(term => queryLower.includes(term));
    
    if (hasPoliticalTerms) {
      contentAdjustment = -0.05; // Political content can be slightly more permissive
    }
    
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
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    
    try {
      console.log(`[VectorSearchService] Calling similarity_search with threshold: ${threshold}, documentIds: ${documentIds ? `[${documentIds.length} docs]` : 'all'}`);
      
      let chunks, error;
      
      if (documentIds && documentIds.length > 0) {
        // Use document-filtered search for QA collections
        console.log(`[VectorSearchService] Document-filtered search parameters:`, {
          user_id_filter: userId,
          document_ids_filter: documentIds,
          similarity_threshold: threshold,
          match_count: limit,
          embedding_length: queryEmbedding.length
        });
        
        const result = await supabaseService
          .rpc('similarity_search_with_documents', {
            query_embedding: embeddingString,
            user_id_filter: userId,
            document_ids_filter: documentIds,
            similarity_threshold: threshold,
            match_count: limit
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
            user_id_filter: userId,
            similarity_threshold: threshold,
            match_count: limit
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
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    
    try {
      console.log(`[VectorSearchService] Calling Grundsatz similarity_search with threshold: ${threshold}`);
      
      // Call the RPC function specifically for Grundsatz documents
      const { data: chunks, error } = await supabaseService
        .rpc('similarity_search_grundsatz', {
          query_embedding: embeddingString,
          similarity_threshold: threshold,
          match_count: limit
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
}


// Export singleton instance
export const vectorSearchService = new VectorSearchService();