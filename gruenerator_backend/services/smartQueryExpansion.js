import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from './embeddingService.js';

/**
 * Smart Query Expansion Service
 * Uses vector space navigation and document feedback to intelligently expand queries
 * Automatically discovers semantic relationships from your actual document corpus
 */
class SmartQueryExpansion {
  constructor() {
    this.expansionCache = new Map(); // Cache expansions for performance
    this.maxExpansionTerms = 3;
    this.semanticThreshold = 0.75; // High threshold for semantic neighbors
    this.feedbackThreshold = 0.2;  // Low threshold for document feedback
  }

  /**
   * Main entry point: Intelligently expand a query using multiple strategies
   * @param {string} originalQuery - Original search query
   * @param {string} userId - User ID for personalized expansion
   * @returns {Promise<Object>} Expansion result with enhanced queries
   */
  async expandQuery(originalQuery, userId) {
    const startTime = Date.now();
    
    try {
      console.log(`[SmartQueryExpansion] Expanding query: "${originalQuery}"`);
      
      // Check cache first
      const cacheKey = `${originalQuery}_${userId}`;
      if (this.expansionCache.has(cacheKey)) {
        console.log(`[SmartQueryExpansion] Cache HIT for: "${originalQuery}"`);
        return this.expansionCache.get(cacheKey);
      }

      // Stage 1: Vector space semantic expansion
      const semanticExpansion = await this.findSemanticNeighbors(originalQuery, userId);
      
      // Stage 2: Document feedback expansion  
      const feedbackExpansion = await this.getDocumentFeedbackTerms(originalQuery, userId);
      
      // Stage 3: Intelligent combination
      const result = this.combineExpansions(originalQuery, semanticExpansion, feedbackExpansion);
      
      // Cache the result
      this.expansionCache.set(cacheKey, result);
      
      const duration = Date.now() - startTime;
      console.log(`[SmartQueryExpansion] Completed expansion in ${duration}ms:`, {
        original: originalQuery,
        semanticTerms: semanticExpansion.terms,
        feedbackTerms: feedbackExpansion.terms,
        finalQueries: result.expandedQueries
      });
      
      return result;
      
    } catch (error) {
      console.error('[SmartQueryExpansion] Expansion failed:', error);
      // Fallback to original query
      return {
        originalQuery,
        expandedQueries: [originalQuery],
        expansionSources: [],
        expansionTerms: [],
        fallback: true
      };
    }
  }

  /**
   * Stage 1: Find semantically similar terms using vector space navigation
   * Discovers terms that are close in embedding space to the query
   */
  async findSemanticNeighbors(query, userId) {
    try {
      console.log(`[SmartQueryExpansion] Finding semantic neighbors for: "${query}"`);
      
      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateQueryEmbedding(query);
      
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
        console.warn('[SmartQueryExpansion] Invalid query embedding generated');
        return { terms: [], confidence: 0 };
      }

      // Find similar terms from document chunks in user's corpus using existing function
      const embeddingString = `[${queryEmbedding.join(',')}]`;
      
      const { data: similarChunks, error } = await supabaseService
        .rpc('similarity_search_optimized', {
          query_embedding: embeddingString,
          user_id_filter: userId,
          similarity_threshold: this.semanticThreshold,
          match_count: 20 // Get more candidates for term extraction
        });

      if (error) {
        console.warn('[SmartQueryExpansion] Semantic neighbors RPC failed:', error);
        return { terms: [], confidence: 0 };
      }

      // Transform the results to match expected format
      const transformedChunks = (similarChunks || []).map(chunk => ({
        chunk_text: chunk.chunk_text,
        similarity: chunk.similarity,
        document_title: chunk.document_title || chunk.title
      }));

      // Extract key terms from similar chunks
      const extractedTerms = this.extractKeyTermsFromChunks(transformedChunks, query);
      
      return {
        terms: extractedTerms.slice(0, this.maxExpansionTerms),
        confidence: extractedTerms.length > 0 ? 0.8 : 0,
        source: 'semantic_space'
      };
      
    } catch (error) {
      console.warn('[SmartQueryExpansion] Semantic expansion failed:', error);
      return { terms: [], confidence: 0 };
    }
  }

  /**
   * Stage 2: Get expansion terms from document feedback
   * Performs a loose search and extracts terms from found documents
   */
  async getDocumentFeedbackTerms(query, userId) {
    try {
      console.log(`[SmartQueryExpansion] Getting document feedback for: "${query}"`);
      
      // Generate embedding for loose search
      const queryEmbedding = await embeddingService.generateQueryEmbedding(query);
      if (!queryEmbedding) {
        return { terms: [], confidence: 0 };
      }

      // Perform loose similarity search to find potentially relevant documents
      const embeddingString = `[${queryEmbedding.join(',')}]`;
      
      const { data: feedbackChunks, error } = await supabaseService
        .rpc('similarity_search_optimized', {
          query_embedding: embeddingString,
          user_id_filter: userId,
          similarity_threshold: this.feedbackThreshold, // Very permissive
          match_count: 15 // Get more documents for better term extraction
        });

      if (error || !feedbackChunks || feedbackChunks.length === 0) {
        console.log('[SmartQueryExpansion] No feedback documents found');
        return { terms: [], confidence: 0 };
      }

      // Extract key terms from the found documents
      const extractedTerms = this.extractKeyTermsFromChunks(feedbackChunks, query);
      
      return {
        terms: extractedTerms.slice(0, this.maxExpansionTerms),
        confidence: feedbackChunks.length > 5 ? 0.7 : 0.4,
        source: 'document_feedback',
        sourceDocuments: feedbackChunks.length
      };
      
    } catch (error) {
      console.warn('[SmartQueryExpansion] Document feedback failed:', error);
      return { terms: [], confidence: 0 };
    }
  }

  /**
   * Extract meaningful terms from document chunks
   * Uses German-aware term extraction
   */
  extractKeyTermsFromChunks(chunks, originalQuery) {
    if (!chunks || chunks.length === 0) {
      return [];
    }

    // Combine all chunk texts
    const allText = chunks
      .map(chunk => chunk.chunk_text || '')
      .join(' ')
      .toLowerCase();

    // German stopwords and common words to exclude
    const stopwords = new Set([
      'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'eines', 'einem',
      'und', 'oder', 'aber', 'doch', 'sondern', 'dennoch', 'jedoch', 'also', 'daher',
      'ist', 'sind', 'war', 'waren', 'wird', 'werden', 'wurde', 'wurden', 'haben', 'hat',
      'sein', 'ihre', 'ihrer', 'ihres', 'sich', 'nicht', 'nur', 'auch', 'noch', 'schon',
      'sehr', 'mehr', 'viel', 'wenig', 'alle', 'viele', 'wenige', 'andere', 'andere',
      'für', 'mit', 'bei', 'von', 'zu', 'an', 'auf', 'in', 'über', 'unter', 'durch',
      'dass', 'wenn', 'weil', 'damit', 'obwohl', 'während', 'bevor', 'nachdem',
      originalQuery.toLowerCase() // Exclude the original query term
    ]);

    // Extract potential terms (2-15 characters, mostly letters)
    const termPattern = /\b[a-zäöüß]{3,15}\b/g;
    const extractedTerms = allText.match(termPattern) || [];

    // Count frequency and filter
    const termCounts = new Map();
    extractedTerms.forEach(term => {
      if (!stopwords.has(term) && term.length >= 4) {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      }
    });

    // Sort by frequency and return top terms
    const sortedTerms = Array.from(termCounts.entries())
      .filter(([term, count]) => count >= 2) // Must appear at least twice
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .map(([term]) => term);

    console.log(`[SmartQueryExpansion] Extracted ${sortedTerms.length} terms from ${chunks.length} chunks:`, sortedTerms.slice(0, 8));
    
    return sortedTerms;
  }

  /**
   * Stage 3: Intelligently combine expansion results
   * Creates multiple query variants with different expansion strategies
   */
  combineExpansions(originalQuery, semanticExpansion, feedbackExpansion) {
    const expandedQueries = [originalQuery]; // Always include original
    const expansionTerms = [];
    const expansionSources = [];

    // Add semantic expansion terms
    if (semanticExpansion.terms.length > 0 && semanticExpansion.confidence > 0.5) {
      const semanticQuery = `${originalQuery} ${semanticExpansion.terms[0]}`;
      expandedQueries.push(semanticQuery);
      expansionTerms.push(...semanticExpansion.terms);
      expansionSources.push(semanticExpansion.source);
    }

    // Add document feedback terms  
    if (feedbackExpansion.terms.length > 0 && feedbackExpansion.confidence > 0.3) {
      const feedbackQuery = `${originalQuery} ${feedbackExpansion.terms[0]}`;
      expandedQueries.push(feedbackQuery);
      expansionTerms.push(...feedbackExpansion.terms);
      expansionSources.push(feedbackExpansion.source);
    }

    // Create a combined expansion if we have terms from both sources
    if (semanticExpansion.terms.length > 0 && feedbackExpansion.terms.length > 0) {
      const combinedTerms = [
        semanticExpansion.terms[0],
        feedbackExpansion.terms[0]
      ].filter(Boolean);
      
      if (combinedTerms.length > 0) {
        const combinedQuery = `${originalQuery} ${combinedTerms.join(' ')}`;
        expandedQueries.push(combinedQuery);
        expansionSources.push('combined');
      }
    }

    // Remove duplicates while preserving order
    const uniqueQueries = [...new Set(expandedQueries)];

    return {
      originalQuery,
      expandedQueries: uniqueQueries,
      expansionTerms: [...new Set(expansionTerms)],
      expansionSources: [...new Set(expansionSources)],
      semanticConfidence: semanticExpansion.confidence,
      feedbackConfidence: feedbackExpansion.confidence,
      totalExpansions: uniqueQueries.length - 1
    };
  }

  /**
   * Clear the expansion cache (useful for testing)
   */
  clearCache() {
    this.expansionCache.clear();
    console.log('[SmartQueryExpansion] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.expansionCache.size,
      maxExpansionTerms: this.maxExpansionTerms,
      semanticThreshold: this.semanticThreshold,
      feedbackThreshold: this.feedbackThreshold
    };
  }
}

// Export singleton instance
export const smartQueryExpansion = new SmartQueryExpansion();