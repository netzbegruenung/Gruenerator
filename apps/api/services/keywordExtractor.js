/**
 * Keyword Extraction Service
 * Extracts meaningful keywords and phrases from search queries
 * Optimized for German language with fallback to English
 */

/**
 * German stopwords - common words to filter out
 */
const GERMAN_STOPWORDS = new Set([
  // Articles
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem', 'eines',
  // Prepositions
  'in', 'auf', 'an', 'bei', 'mit', 'von', 'zu', 'für', 'über', 'unter', 'durch', 'gegen', 'ohne', 'um',
  // Pronouns
  'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie', 'mich', 'dich', 'sich', 'uns', 'euch',
  'mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'dieser', 'diese', 'dieses', 'jener', 'jene', 'jenes',
  // Auxiliary verbs
  'ist', 'sind', 'war', 'waren', 'bin', 'bist', 'hat', 'haben', 'hatte', 'hatten', 'wird', 'werden',
  // Conjunctions
  'und', 'oder', 'aber', 'denn', 'sondern', 'doch', 'jedoch', 'sowie', 'als', 'wenn', 'weil', 'da', 'dass',
  // Common words
  'nicht', 'auch', 'nur', 'noch', 'schon', 'mehr', 'sehr', 'so', 'wie', 'was', 'wo', 'wann', 'warum', 'wie',
  'hier', 'dort', 'heute', 'gestern', 'morgen', 'immer', 'nie', 'oft', 'manchmal', 'bereits', 'dann',
  // English stopwords (fallback)
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were'
]);

/**
 * Keyword extraction configuration
 */
const CONFIG = {
  minKeywordLength: 2,
  maxKeywordLength: 50,
  minQueryLength: 1,
  maxNgramSize: 3,
  keywordWeightThreshold: 0.1,
  phraseBoostFactor: 1.5,
  exactMatchBoostFactor: 2.0
};

class KeywordExtractor {
  constructor() {
    this.stopwords = GERMAN_STOPWORDS;
  }

  /**
   * Extract keywords and phrases from a search query
   * @param {string} query - Search query text
   * @param {Object} options - Extraction options
   * @returns {Object} Extracted keywords with weights and metadata
   */
  extractKeywords(query, options = {}) {
    if (!query || typeof query !== 'string' || query.trim().length < CONFIG.minQueryLength) {
      return {
        keywords: [],
        phrases: [],
        originalQuery: query?.trim() || '',
        metadata: {
          queryLength: 0,
          language: 'unknown'
        }
      };
    }

    const cleanQuery = query.trim().toLowerCase();
    const tokens = this.tokenize(cleanQuery);
    
    if (tokens.length === 0) {
      return {
        keywords: [],
        phrases: [],
        originalQuery: query.trim(),
        metadata: {
          queryLength: 0,
          language: 'unknown'
        }
      };
    }

    // Detect likely language (simple heuristic)
    const language = this.detectLanguage(tokens);
    
    // Extract individual keywords
    const keywords = this.extractIndividualKeywords(tokens);
    
    // Extract n-gram phrases
    const phrases = this.extractPhrases(tokens, options.maxNgramSize || CONFIG.maxNgramSize);
    
    // Calculate keyword weights
    const weightedKeywords = this.calculateKeywordWeights(keywords, tokens.length);
    const weightedPhrases = this.calculatePhraseWeights(phrases, tokens.length);
    
    // Filter by weight threshold
    const filteredKeywords = weightedKeywords.filter(kw => kw.weight >= CONFIG.keywordWeightThreshold);
    const filteredPhrases = weightedPhrases.filter(phrase => phrase.weight >= CONFIG.keywordWeightThreshold);

    return {
      keywords: filteredKeywords,
      phrases: filteredPhrases,
      originalQuery: query.trim(),
      metadata: {
        queryLength: tokens.length,
        language: language,
        totalKeywords: filteredKeywords.length,
        totalPhrases: filteredPhrases.length
      }
    };
  }

  /**
   * Generate search patterns for Qdrant text matching
   * @param {string} query - Search query
   * @returns {Object} Search patterns for different match types
   */
  generateSearchPatterns(query) {
    const extraction = this.extractKeywords(query);
    const patterns = {
      exact: query.trim(),
      keywords: [],
      phrases: [],
      fuzzy: []
    };

    // Add individual keywords
    extraction.keywords.forEach(kw => {
      patterns.keywords.push(kw.term);
      // Add fuzzy variants for longer terms
      if (kw.term.length > 4) {
        patterns.fuzzy.push(kw.term);
      }
    });

    // Add phrase patterns
    extraction.phrases.forEach(phrase => {
      patterns.phrases.push(phrase.term);
      // Quoted phrases for exact matching
      patterns.phrases.push(`"${phrase.term}"`);
    });

    return {
      ...patterns,
      metadata: extraction.metadata
    };
  }

  /**
   * Create Qdrant filter conditions for text matching
   * @param {string} query - Search query
   * @param {Object} options - Filter options
   * @returns {Object} Qdrant filter conditions
   */
  createTextFilters(query, options = {}) {
    const patterns = this.generateSearchPatterns(query);
    const conditions = [];

    // Exact match condition (highest priority)
    if (patterns.exact && patterns.exact.length > 0) {
      conditions.push({
        type: 'exact',
        condition: {
          key: 'chunk_text',
          match: { text: patterns.exact }
        },
        weight: CONFIG.exactMatchBoostFactor
      });
    }

    // Phrase match conditions
    patterns.phrases.forEach(phrase => {
      conditions.push({
        type: 'phrase',
        condition: {
          key: 'chunk_text',
          match: { text: phrase }
        },
        weight: CONFIG.phraseBoostFactor
      });
    });

    // Keyword match conditions
    patterns.keywords.forEach(keyword => {
      conditions.push({
        type: 'keyword',
        condition: {
          key: 'chunk_text',
          match: { text: keyword }
        },
        weight: 1.0
      });
    });

    // Title/filename boost conditions
    if (options.includeMetadata) {
      const titleConditions = patterns.keywords.map(keyword => ({
        type: 'metadata',
        condition: {
          key: 'title',
          match: { text: keyword }
        },
        weight: 1.3 // Boost for title matches
      }));
      conditions.push(...titleConditions);
    }

    return {
      conditions,
      patterns,
      metadata: {
        totalConditions: conditions.length,
        queryComplexity: this.calculateQueryComplexity(patterns)
      }
    };
  }

  /**
   * Tokenize text into individual words
   * @param {string} text - Text to tokenize
   * @returns {Array<string>} Array of tokens
   * @private
   */
  tokenize(text) {
    // Split on whitespace and punctuation, but preserve hyphenated words
    return text
      .toLowerCase()
      .replace(/[^\w\säöüß-]/g, ' ') // Keep German umlauts and hyphens
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token => 
        token.length >= CONFIG.minKeywordLength && 
        token.length <= CONFIG.maxKeywordLength &&
        !this.stopwords.has(token) &&
        !/^\d+$/.test(token) // Filter out pure numbers
      );
  }

  /**
   * Extract individual keywords from tokens
   * @param {Array<string>} tokens - Tokenized text
   * @returns {Array<string>} Filtered keywords
   * @private
   */
  extractIndividualKeywords(tokens) {
    const uniqueTokens = [...new Set(tokens)];
    return uniqueTokens.filter(token => this.isValidKeyword(token));
  }

  /**
   * Extract n-gram phrases from tokens
   * @param {Array<string>} tokens - Tokenized text
   * @param {number} maxN - Maximum n-gram size
   * @returns {Array<string>} Extracted phrases
   * @private
   */
  extractPhrases(tokens, maxN = 3) {
    const phrases = [];
    
    for (let n = 2; n <= Math.min(maxN, tokens.length); n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const phrase = tokens.slice(i, i + n).join(' ');
        if (this.isValidPhrase(phrase)) {
          phrases.push(phrase);
        }
      }
    }
    
    return [...new Set(phrases)]; // Remove duplicates
  }

  /**
   * Calculate weights for individual keywords
   * @param {Array<string>} keywords - Keywords to weight
   * @param {number} totalTokens - Total number of tokens in query
   * @returns {Array<Object>} Keywords with weights
   * @private
   */
  calculateKeywordWeights(keywords, totalTokens) {
    return keywords.map(keyword => {
      // Simple frequency-based weighting
      let weight = 1.0;
      
      // Boost longer keywords (more specific)
      if (keyword.length > 6) {
        weight *= 1.2;
      }
      
      // Boost compound words (German specialty)
      if (keyword.includes('-') || keyword.length > 12) {
        weight *= 1.3;
      }
      
      // Normalize by query length
      weight = weight / Math.log(totalTokens + 1);
      
      return {
        term: keyword,
        weight: Math.min(1.0, weight),
        type: 'keyword'
      };
    });
  }

  /**
   * Calculate weights for phrases
   * @param {Array<string>} phrases - Phrases to weight
   * @param {number} totalTokens - Total number of tokens in query
   * @returns {Array<Object>} Phrases with weights
   * @private
   */
  calculatePhraseWeights(phrases, totalTokens) {
    return phrases.map(phrase => {
      const phraseTokens = phrase.split(' ').length;
      
      // Longer phrases get higher weights (more specific)
      let weight = phraseTokens * 0.4;
      
      // Normalize by query length
      weight = weight / Math.log(totalTokens + 1);
      
      return {
        term: phrase,
        weight: Math.min(1.0, weight),
        type: 'phrase',
        tokenCount: phraseTokens
      };
    });
  }

  /**
   * Simple language detection based on common words
   * @param {Array<string>} tokens - Tokenized text
   * @returns {string} Detected language
   * @private
   */
  detectLanguage(tokens) {
    const germanIndicators = ['der', 'die', 'das', 'und', 'oder', 'ist', 'sind', 'haben', 'für', 'mit'];
    const englishIndicators = ['the', 'and', 'or', 'is', 'are', 'have', 'for', 'with'];
    
    let germanScore = 0;
    let englishScore = 0;
    
    tokens.forEach(token => {
      if (germanIndicators.includes(token)) germanScore++;
      if (englishIndicators.includes(token)) englishScore++;
    });
    
    if (germanScore > englishScore) return 'german';
    if (englishScore > germanScore) return 'english';
    return 'mixed';
  }

  /**
   * Check if a token is a valid keyword (optimized)
   * @param {string} token - Token to validate
   * @returns {boolean} Whether token is valid
   * @private
   */
  isValidKeyword(token) {
    return token.length >= CONFIG.minKeywordLength && 
           !this.stopwords.has(token) && 
           !/^\d+$/.test(token) &&
           /[a-zäöüß]/i.test(token);
  }

  /**
   * Check if a phrase is valid for extraction (optimized)
   * @param {string} phrase - Phrase to validate
   * @returns {boolean} Whether phrase is valid
   * @private
   */
  isValidPhrase(phrase) {
    if (phrase.length > CONFIG.maxKeywordLength) return false;
    
    const tokens = phrase.split(' ');
    return tokens.some(token => !this.stopwords.has(token));
  }

  /**
   * Calculate query complexity score (simplified)
   * @param {Object} patterns - Search patterns
   * @returns {number} Complexity score (0-1)
   * @private
   */
  calculateQueryComplexity(patterns) {
    const complexity = (patterns.keywords.length * 0.1) + 
                      (patterns.phrases.length * 0.2) + 
                      (patterns.exact?.length > 10 ? 0.3 : 0);
    
    return Math.min(1.0, complexity);
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    return {
      stopwordsCount: this.stopwords.size,
      config: CONFIG,
      version: '1.0.0'
    };
  }
}

// Export singleton instance
export const keywordExtractor = new KeywordExtractor();
export { KeywordExtractor };
export default keywordExtractor;