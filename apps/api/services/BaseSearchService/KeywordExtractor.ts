/**
 * KeywordExtractor - German-optimized keyword and phrase extraction
 *
 * Features:
 * - German stopword filtering (comprehensive list)
 * - N-gram phrase extraction (2-3 words)
 * - Keyword weighting (length, compound words, frequency)
 * - Language detection (German/English/mixed)
 * - Search pattern generation for hybrid search
 *
 * @example
 * ```typescript
 * const patterns = keywordExtractor.generateSearchPatterns('Klimaschutz im Grundsatzprogramm');
 * // Returns: { exact: '...', keywords: ['klimaschutz', 'grundsatzprogramm'], phrases: [...], fuzzy: [...] }
 * ```
 */

import type {
  KeywordExtractionConfig,
  Language,
  WeightedKeyword,
  KeywordExtractionResult,
  SearchPatternResult,
  KeywordExtractionOptions,
  KeywordExtractorStats
} from './keyword-extractor-types.js';

/**
 * German stopwords - common words filtered from keyword extraction
 * Includes articles, prepositions, pronouns, auxiliary verbs, conjunctions
 * with English fallback for mixed-language queries
 */
const GERMAN_STOPWORDS: ReadonlySet<string> = new Set([
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
 * Optimized for German language queries with English fallback
 */
const CONFIG: Readonly<KeywordExtractionConfig> = {
  minKeywordLength: 2,
  maxKeywordLength: 50,
  minQueryLength: 1,
  maxNgramSize: 3,
  keywordWeightThreshold: 0.1,
  phraseBoostFactor: 1.5,
  exactMatchBoostFactor: 2.0
} as const;

/**
 * KeywordExtractor class for German-optimized keyword and phrase extraction
 */
class KeywordExtractor {
  private readonly stopwords: ReadonlySet<string>;

  constructor() {
    this.stopwords = GERMAN_STOPWORDS;
  }

  /**
   * Extract keywords and phrases from a search query
   * @param query - Search query text
   * @param options - Extraction options
   * @returns Extracted keywords with weights and metadata
   */
  extractKeywords(query: string, options: KeywordExtractionOptions = {}): KeywordExtractionResult {
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

    const language = this.detectLanguage(tokens);
    const keywords = this.extractIndividualKeywords(tokens);
    const phrases = this.extractPhrases(tokens, options.maxNgramSize || CONFIG.maxNgramSize);
    const weightedKeywords = this.calculateKeywordWeights(keywords, tokens.length);
    const weightedPhrases = this.calculatePhraseWeights(phrases, tokens.length);
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
   * PRIMARY PUBLIC API - Used by BaseSearchService for hybrid search
   * @param query - Search query
   * @returns Search patterns for different match types
   */
  generateSearchPatterns(query: string): SearchPatternResult {
    const extraction = this.extractKeywords(query);
    const patternData: Omit<SearchPatternResult, 'metadata' | 'patterns'> = {
      exact: query.trim(),
      keywords: [],
      phrases: [],
      fuzzy: []
    };

    extraction.keywords.forEach(kw => {
      patternData.keywords.push(kw.term);
      if (kw.term.length > 4) {
        patternData.fuzzy.push(kw.term);
      }
    });

    extraction.phrases.forEach(phrase => {
      patternData.phrases.push(phrase.term);
      patternData.phrases.push(`"${phrase.term}"`);
    });

    // Combine all patterns into a single array for metadata
    const allPatterns = [
      ...patternData.keywords,
      ...patternData.phrases,
      ...patternData.fuzzy
    ];

    return {
      ...patternData,
      patterns: [...new Set(allPatterns)], // Remove duplicates
      metadata: extraction.metadata
    };
  }

  /**
   * Get service statistics and configuration
   * @returns Service statistics
   */
  getStats(): KeywordExtractorStats {
    return {
      stopwordsCount: this.stopwords.size,
      config: CONFIG,
      version: '1.0.0'
    };
  }

  /**
   * Tokenize text into individual words
   * @param text - Text to tokenize
   * @returns Array of tokens
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\säöüß-]/g, ' ')
      .split(/\s+/)
      .map(token => token.trim())
      .filter(token =>
        token.length >= CONFIG.minKeywordLength &&
        token.length <= CONFIG.maxKeywordLength &&
        !this.stopwords.has(token) &&
        !/^\d+$/.test(token)
      );
  }

  /**
   * Extract individual keywords from tokens
   * @param tokens - Tokenized text
   * @returns Filtered keywords
   */
  private extractIndividualKeywords(tokens: string[]): string[] {
    const uniqueTokens = [...new Set(tokens)];
    return uniqueTokens.filter(token => this.isValidKeyword(token));
  }

  /**
   * Extract n-gram phrases from tokens
   * @param tokens - Tokenized text
   * @param maxN - Maximum n-gram size
   * @returns Extracted phrases
   */
  private extractPhrases(tokens: string[], maxN: number = 3): string[] {
    const phrases: string[] = [];

    for (let n = 2; n <= Math.min(maxN, tokens.length); n++) {
      for (let i = 0; i <= tokens.length - n; i++) {
        const phrase = tokens.slice(i, i + n).join(' ');
        if (this.isValidPhrase(phrase)) {
          phrases.push(phrase);
        }
      }
    }

    return [...new Set(phrases)];
  }

  /**
   * Calculate weights for individual keywords
   * @param keywords - Keywords to weight
   * @param totalTokens - Total number of tokens in query
   * @returns Keywords with weights
   */
  private calculateKeywordWeights(keywords: string[], totalTokens: number): WeightedKeyword[] {
    return keywords.map(keyword => {
      let weight = 1.0;

      if (keyword.length > 6) {
        weight *= 1.2;
      }

      if (keyword.includes('-') || keyword.length > 12) {
        weight *= 1.3;
      }

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
   * @param phrases - Phrases to weight
   * @param totalTokens - Total number of tokens in query
   * @returns Phrases with weights
   */
  private calculatePhraseWeights(phrases: string[], totalTokens: number): WeightedKeyword[] {
    return phrases.map(phrase => {
      const phraseTokens = phrase.split(' ').length;
      let weight = phraseTokens * 0.4;
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
   * @param tokens - Tokenized text
   * @returns Detected language
   */
  private detectLanguage(tokens: string[]): Language {
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
   * Check if a token is a valid keyword
   * @param token - Token to validate
   * @returns Whether token is valid
   */
  private isValidKeyword(token: string): boolean {
    return token.length >= CONFIG.minKeywordLength &&
           !this.stopwords.has(token) &&
           !/^\d+$/.test(token) &&
           /[a-zäöüß]/i.test(token);
  }

  /**
   * Check if a phrase is valid for extraction
   * @param phrase - Phrase to validate
   * @returns Whether phrase is valid
   */
  private isValidPhrase(phrase: string): boolean {
    if (phrase.length > CONFIG.maxKeywordLength) return false;

    const tokens = phrase.split(' ');
    return tokens.some(token => !this.stopwords.has(token));
  }
}

// Export singleton instance
export const keywordExtractor = new KeywordExtractor();
export { KeywordExtractor };
export default keywordExtractor;
