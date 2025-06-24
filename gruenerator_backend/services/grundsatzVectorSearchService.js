import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from './embeddingService.js';

/**
 * Specialized vector search service for Grundsatz documents
 * Searches through official Bündnis 90/Die Grünen political documents
 */
class GrundsatzVectorSearchService {
  
  /**
   * Search Grundsatz documents using vector similarity
   * @param {Object} searchParams - Search parameters
   * @param {string} searchParams.query - Search query
   * @param {string} searchParams.user_id - User ID (for logging)
   * @param {number} searchParams.limit - Maximum results to return
   * @param {string} searchParams.mode - Search mode ('vector', 'hybrid', 'keyword')
   * @returns {Promise<Object>} Search results from Grundsatz documents
   */
  async search(searchParams) {
    const { 
      query, 
      user_id, 
      limit = 5, 
      mode = 'vector',
      threshold = null
    } = searchParams;

    console.log(`[GrundsatzVectorSearchService] Search request: query="${query}", mode="${mode}", user_id="${user_id}"`);

    try {
      // Generate embedding for the query
      const queryEmbedding = await embeddingService.generateQueryEmbedding(query);
      
      if (!embeddingService.validateEmbedding(queryEmbedding)) {
        throw new Error('Invalid query embedding generated for Grundsatz search');
      }

      // Calculate dynamic threshold if not provided
      const dynamicThreshold = threshold ?? this.calculateDynamicThreshold(query);
      console.log(`[GrundsatzVectorSearchService] Using Grundsatz similarity threshold: ${dynamicThreshold}`);

      // Search Grundsatz document chunks
      const chunks = await this.findSimilarGrundsatzChunks(queryEmbedding, limit * 3, dynamicThreshold);
      
      if (chunks.length === 0) {
        console.log(`[GrundsatzVectorSearchService] No Grundsatz vector results found`);
        
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

      console.log(`[GrundsatzVectorSearchService] Found ${documentResults.length} relevant Grundsatz documents`);

      return {
        success: true,
        results: documentResults,
        query: query.trim(),
        searchType: 'grundsatz_vector',
        message: `Found ${documentResults.length} relevant document(s) from Grundsatzprogramme`
      };

    } catch (error) {
      console.error('[GrundsatzVectorSearchService] Search error:', error);
      
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
    
    console.log(`[GrundsatzVectorSearchService] Dynamic threshold calculation:`, {
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
   * Find similar Grundsatz document chunks using vector similarity
   * @private
   */
  async findSimilarGrundsatzChunks(queryEmbedding, limit, threshold) {
    const embeddingString = `[${queryEmbedding.join(',')}]`;
    
    try {
      console.log(`[GrundsatzVectorSearchService] Calling Grundsatz similarity_search with threshold: ${threshold}`);
      
      // Call the RPC function specifically for Grundsatz documents
      const { data: chunks, error } = await supabaseService
        .rpc('similarity_search_grundsatz', {
          query_embedding: embeddingString,
          similarity_threshold: threshold,
          match_count: limit
        });

      if (error) {
        console.error('[GrundsatzVectorSearchService] Grundsatz RPC error:', error);
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

      console.log(`[GrundsatzVectorSearchService] Found ${transformedChunks.length} similar Grundsatz chunks`);
      return transformedChunks;
      
    } catch (error) {
      console.error('[GrundsatzVectorSearchService] Find similar Grundsatz chunks error:', error);
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
   * Get Grundsatz document statistics
   */
  async getGrundsatzStats() {
    try {
      const { data: totalDocs, error: totalError } = await supabaseService
        .from('grundsatz_documents')
        .select('id', { count: 'exact' });

      const { data: embeddedDocs, error: embeddedError } = await supabaseService
        .from('grundsatz_document_chunks')
        .select('document_id', { count: 'exact' });

      if (totalError || embeddedError) {
        throw new Error('Failed to get Grundsatz document statistics');
      }

      return {
        totalDocuments: totalDocs?.length || 0,
        totalChunks: embeddedDocs?.length || 0,
        documentsWithEmbeddings: totalDocs?.length || 0 // All grundsatz docs should have embeddings
      };
    } catch (error) {
      console.error('[GrundsatzVectorSearchService] Error getting stats:', error);
      return { totalDocuments: 0, totalChunks: 0, documentsWithEmbeddings: 0 };
    }
  }
}

// Export singleton instance
export const grundsatzVectorSearchService = new GrundsatzVectorSearchService();