import { supabaseService } from '../utils/supabaseClient.js';
import { embeddingService } from './embeddingService.js';
import { vectorSearchService } from './vectorSearchService.js';

/**
 * Multi-stage retrieval pipeline for professional-grade search
 * Implements a four-stage funnel approach for optimal relevance
 */
class MultiStageRetrieval {

  /**
   * Execute the full multi-stage retrieval pipeline
   * @param {string} query - Search query
   * @param {string} userId - User ID for access control
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Optimized search results
   */
  async search(query, userId, options = {}) {
    const {
      limit = 5,
      enableStages = {
        approximateSearch: true,
        semanticFilter: true,
        contextualRerank: true,
        diversityInjection: true
      }
    } = options;

    console.log(`[MultiStageRetrieval] Starting pipeline for: "${query}"`);
    const startTime = Date.now();

    try {
      // Stage 1: Fast approximate search (large candidate pool)
      let candidates = [];
      if (enableStages.approximateSearch) {
        candidates = await this.stage1_ApproximateSearch(query, userId, limit * 20);
        console.log(`[MultiStageRetrieval] Stage 1: ${candidates.length} candidates`);
      }

      if (candidates.length === 0) {
        // Fallback to regular vector search
        return await vectorSearchService.searchDocuments(query, userId, { limit });
      }

      // Stage 2: Semantic filtering
      let semanticFiltered = candidates;
      if (enableStages.semanticFilter && candidates.length > limit * 2) {
        semanticFiltered = await this.stage2_SemanticFilter(candidates, query, limit * 4);
        console.log(`[MultiStageRetrieval] Stage 2: ${semanticFiltered.length} after semantic filtering`);
      }

      // Stage 3: Contextual reranking
      let contextRanked = semanticFiltered;
      if (enableStages.contextualRerank && semanticFiltered.length > limit) {
        contextRanked = await this.stage3_ContextualRerank(semanticFiltered, query, limit * 2);
        console.log(`[MultiStageRetrieval] Stage 3: ${contextRanked.length} after reranking`);
      }

      // Stage 4: Diversity injection
      let finalResults = contextRanked;
      if (enableStages.diversityInjection) {
        finalResults = this.stage4_DiversityInjection(contextRanked, limit);
        console.log(`[MultiStageRetrieval] Stage 4: ${finalResults.length} final results`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`[MultiStageRetrieval] Pipeline completed in ${totalTime}ms`);

      return {
        success: true,
        results: finalResults,
        query: query.trim(),
        searchType: 'multi_stage',
        message: `Found ${finalResults.length} documents using multi-stage retrieval`,
        performance: {
          totalTime: totalTime,
          stages: {
            stage1_candidates: candidates.length,
            stage2_filtered: semanticFiltered.length,
            stage3_reranked: contextRanked.length,
            stage4_final: finalResults.length
          }
        }
      };

    } catch (error) {
      console.error('[MultiStageRetrieval] Pipeline error:', error);
      
      // Fallback to hybrid search
      return await vectorSearchService.hybridSearch(query, userId, { limit });
    }
  }

  /**
   * Stage 1: Fast approximate search with relaxed thresholds
   * @private
   */
  async stage1_ApproximateSearch(query, userId, candidateLimit) {
    try {
      // Use very relaxed threshold for broad recall
      const results = await vectorSearchService.searchDocuments(query, userId, {
        limit: candidateLimit,
        threshold: 0.15, // Very low threshold for high recall
        includeKeywordSearch: true
      });

      return results.results || [];
    } catch (error) {
      console.warn('[MultiStageRetrieval] Stage 1 failed:', error);
      return [];
    }
  }

  /**
   * Stage 2: Semantic filtering based on query intent
   * @private
   */
  async stage2_SemanticFilter(candidates, query, maxResults) {
    try {
      // Classify query intent
      const queryIntent = await this.classifyQueryIntent(query);
      console.log(`[MultiStageRetrieval] Detected query intent: ${queryIntent}`);

      // Filter candidates based on intent matching
      const filtered = candidates.filter(candidate => 
        this.matchesIntent(candidate, queryIntent, query)
      );

      // If filtering removed too many results, be more permissive
      if (filtered.length < maxResults * 0.3) {
        console.log('[MultiStageRetrieval] Semantic filter too restrictive, using relaxed filtering');
        return candidates.slice(0, maxResults);
      }

      return filtered.slice(0, maxResults);
    } catch (error) {
      console.warn('[MultiStageRetrieval] Stage 2 failed:', error);
      return candidates.slice(0, maxResults);
    }
  }

  /**
   * Stage 3: Contextual reranking with advanced scoring
   * @private
   */
  async stage3_ContextualRerank(candidates, query, maxResults) {
    try {
      // Apply contextual reranking
      const reranked = candidates.map(candidate => ({
        ...candidate,
        contextual_score: this.calculateContextualScore(candidate, query),
        original_score: candidate.similarity_score
      }));

      // Sort by contextual score
      reranked.sort((a, b) => b.contextual_score - a.contextual_score);

      return reranked.slice(0, maxResults);
    } catch (error) {
      console.warn('[MultiStageRetrieval] Stage 3 failed:', error);
      return candidates.slice(0, maxResults);
    }
  }

  /**
   * Stage 4: Diversity injection to avoid redundant results
   * @private
   */
  stage4_DiversityInjection(candidates, finalLimit) {
    try {
      const diverseResults = [];
      const usedTitles = new Set();
      const usedKeywords = new Set();

      // Extract key terms from each candidate
      candidates.forEach(candidate => {
        candidate.keyTerms = this.extractKeyTerms(candidate.relevant_content || candidate.title);
      });

      // Select diverse results
      for (const candidate of candidates) {
        if (diverseResults.length >= finalLimit) break;

        // Check title diversity
        const titleSimilar = usedTitles.has(candidate.title);
        
        // Check content diversity
        const contentOverlap = this.calculateContentOverlap(candidate.keyTerms, usedKeywords);
        
        // Apply diversity threshold
        if (!titleSimilar && contentOverlap < 0.7) {
          diverseResults.push({
            ...candidate,
            diversity_score: 1 - contentOverlap,
            final_score: (candidate.contextual_score || candidate.similarity_score) * (1 + (1 - contentOverlap) * 0.1)
          });
          
          usedTitles.add(candidate.title);
          candidate.keyTerms.forEach(term => usedKeywords.add(term));
        }
      }

      // If we don't have enough diverse results, fill with best remaining
      while (diverseResults.length < finalLimit && diverseResults.length < candidates.length) {
        const remaining = candidates.filter(c => 
          !diverseResults.some(d => d.document_id === c.document_id)
        );
        
        if (remaining.length === 0) break;
        
        diverseResults.push({
          ...remaining[0],
          diversity_score: 0.5,
          final_score: remaining[0].contextual_score || remaining[0].similarity_score
        });
      }

      return diverseResults;
    } catch (error) {
      console.warn('[MultiStageRetrieval] Stage 4 failed:', error);
      return candidates.slice(0, finalLimit);
    }
  }

  /**
   * Classify query intent for semantic filtering
   * @private
   */
  async classifyQueryIntent(query) {
    const queryLower = query.toLowerCase();
    
    // German political domain intents
    if (this.containsTerms(queryLower, ['umwelt', 'klima', 'energie', 'nachhaltigkeit'])) {
      return 'environmental';
    }
    if (this.containsTerms(queryLower, ['bildung', 'schule', 'universität', 'ausbildung'])) {
      return 'education';
    }
    if (this.containsTerms(queryLower, ['wirtschaft', 'arbeit', 'finanzen', 'sozial'])) {
      return 'economic';
    }
    if (this.containsTerms(queryLower, ['verkehr', 'mobilität', 'transport', 'bahn'])) {
      return 'transport';
    }
    if (this.containsTerms(queryLower, ['gesundheit', 'medizin', 'pflege'])) {
      return 'health';
    }
    if (this.containsTerms(queryLower, ['europa', 'international', 'eu'])) {
      return 'international';
    }
    
    return 'general';
  }

  /**
   * Check if candidate matches query intent
   * @private
   */
  matchesIntent(candidate, intent, query) {
    if (intent === 'general') return true;
    
    const content = (candidate.relevant_content || candidate.title || '').toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Intent-specific keyword matching
    const intentKeywords = {
      environmental: ['umwelt', 'klima', 'energie', 'nachhaltigkeit', 'ökologie', 'emission'],
      education: ['bildung', 'schule', 'universität', 'ausbildung', 'lernen', 'lehren'],
      economic: ['wirtschaft', 'arbeit', 'finanzen', 'sozial', 'unternehmen', 'arbeitsplatz'],
      transport: ['verkehr', 'mobilität', 'transport', 'bahn', 'öpnv', 'fahrrad'],
      health: ['gesundheit', 'medizin', 'pflege', 'krankenhaus', 'patient'],
      international: ['europa', 'international', 'eu', 'grenzüberschreitend']
    };

    const keywords = intentKeywords[intent] || [];
    return keywords.some(keyword => content.includes(keyword));
  }

  /**
   * Calculate contextual relevance score
   * @private
   */
  calculateContextualScore(candidate, query) {
    const baseScore = candidate.similarity_score || 0;
    const queryTerms = query.toLowerCase().split(/\s+/);
    const content = (candidate.relevant_content || candidate.title || '').toLowerCase();
    
    // Term frequency boost
    let termBoost = 0;
    queryTerms.forEach(term => {
      const matches = (content.match(new RegExp(term, 'g')) || []).length;
      termBoost += Math.min(matches * 0.1, 0.3); // Cap boost per term
    });
    
    // Position boost (if available)
    const positionBoost = candidate.position_score ? candidate.position_score * 0.1 : 0;
    
    // Diversity boost (if available)
    const diversityBoost = candidate.diversity_bonus || 0;
    
    return Math.min(1.0, baseScore + termBoost + positionBoost + diversityBoost);
  }

  /**
   * Extract key terms from text
   * @private
   */
  extractKeyTerms(text) {
    if (!text) return [];
    
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3) // Remove short words
      .filter(word => !this.isStopWord(word));
    
    // Return unique terms
    return [...new Set(words)].slice(0, 10); // Top 10 terms
  }

  /**
   * Calculate content overlap between key terms
   * @private
   */
  calculateContentOverlap(terms1, existingTermsSet) {
    if (!terms1 || terms1.length === 0) return 0;
    
    const overlapping = terms1.filter(term => existingTermsSet.has(term));
    return overlapping.length / terms1.length;
  }

  /**
   * Check if text contains any of the given terms
   * @private
   */
  containsTerms(text, terms) {
    return terms.some(term => text.includes(term));
  }

  /**
   * Simple German stop word filter
   * @private
   */
  isStopWord(word) {
    const stopWords = new Set([
      'der', 'die', 'das', 'und', 'oder', 'aber', 'mit', 'für', 'von', 'zu', 'in', 'an', 'auf',
      'ist', 'sind', 'war', 'waren', 'hat', 'haben', 'wird', 'werden', 'kann', 'soll', 'muss',
      'ein', 'eine', 'einer', 'eines', 'dem', 'den', 'des', 'sich', 'nicht', 'auch', 'nur'
    ]);
    return stopWords.has(word);
  }
}

// Export singleton instance
export const multiStageRetrieval = new MultiStageRetrieval();