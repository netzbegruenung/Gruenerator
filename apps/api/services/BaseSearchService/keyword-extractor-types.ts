/**
 * KeywordExtractor Type Definitions
 *
 * TypeScript interfaces for German-optimized keyword and phrase extraction
 * Used by BaseSearchService for hybrid search (vector + text matching)
 */

/**
 * Keyword extraction configuration
 * Optimized for German language queries with English fallback
 */
export interface KeywordExtractionConfig {
  readonly minKeywordLength: number;
  readonly maxKeywordLength: number;
  readonly minQueryLength: number;
  readonly maxNgramSize: number;
  readonly keywordWeightThreshold: number;
  readonly phraseBoostFactor: number;
  readonly exactMatchBoostFactor: number;
}

/**
 * Language detection result from query analysis
 */
export type Language = 'german' | 'english' | 'mixed' | 'unknown';

/**
 * Weighted keyword or phrase with metadata
 * Weight ranges from 0-1 based on length, position, and frequency
 */
export interface WeightedKeyword {
  /** The keyword or phrase term */
  term: string;
  /** Weight score (0-1) based on length, position, frequency */
  weight: number;
  /** Type of term */
  type: 'keyword' | 'phrase';
  /** Number of tokens (for phrases only) */
  tokenCount?: number;
}

/**
 * Keyword extraction result with metadata
 * Contains both individual keywords and multi-word phrases
 */
export interface KeywordExtractionResult {
  /** Individual weighted keywords */
  keywords: WeightedKeyword[];
  /** Multi-word weighted phrases (n-grams) */
  phrases: WeightedKeyword[];
  /** Original query text (trimmed) */
  originalQuery: string;
  /** Extraction metadata */
  metadata: {
    /** Number of tokens in query after filtering */
    queryLength: number;
    /** Detected language */
    language: Language;
    /** Number of keywords extracted */
    totalKeywords?: number;
    /** Number of phrases extracted */
    totalPhrases?: number;
  };
}

/**
 * Search patterns for different match types
 * Used by Qdrant for hybrid text + vector search
 */
export interface SearchPatternResult {
  /** Exact match pattern (full query) */
  exact: string;
  /** Individual keyword patterns */
  keywords: string[];
  /** Phrase patterns (including quoted variants) */
  phrases: string[];
  /** Fuzzy match patterns (longer terms only) */
  fuzzy: string[];
  /** Combined array of all search patterns (for metadata) */
  patterns: string[];
  /** Extraction metadata */
  metadata: KeywordExtractionResult['metadata'];
}

/**
 * Options for keyword extraction
 */
export interface KeywordExtractionOptions {
  /** Maximum n-gram size for phrase extraction (default: 3) */
  maxNgramSize?: number;
}

/**
 * Service statistics and configuration
 */
export interface KeywordExtractorStats {
  /** Number of German stopwords configured */
  stopwordsCount: number;
  /** Current configuration */
  config: KeywordExtractionConfig;
  /** Service version */
  version: string;
}
