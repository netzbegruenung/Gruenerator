/**
 * Type definitions for ChunkQualityService
 * German-optimized quality scoring for text chunks
 */

/**
 * Options for quality score calculation
 */
export interface QualityCalculationOptions {
  /** Text to score */
  text: string;
  /** Optional metadata (e.g., contentType) */
  metadata?: ChunkMetadata;
}

/**
 * Metadata associated with a text chunk
 */
export interface ChunkMetadata {
  /** Content type of the chunk (heading, paragraph, list, etc.) */
  contentType?: string;
  /** Additional metadata fields */
  [key: string]: unknown;
}

/**
 * Individual quality component scores
 */
export interface QualityComponents {
  /** Readability score 0-1 (German sentence/word length heuristics) */
  readability: number;
  /** Completeness score 0-1 (cut-off detection at boundaries) */
  completeness: number;
  /** Structure score 0-1 (markdown features) */
  structure: number;
  /** Information density score 0-1 (unique content ratio) */
  density: number;
}

/**
 * Detailed quality assessment result with components and overall score
 */
export interface QualityAssessment extends QualityComponents {
  /** Overall composite score 0-1 */
  overall: number;
  /** Applied weights from configuration */
  weights: QualityWeights;
}

/**
 * Quality scoring weights from vectorConfig
 */
export interface QualityWeights {
  /** Weight for readability component */
  readability: number;
  /** Weight for completeness component */
  completeness: number;
  /** Weight for structure component */
  structure: number;
  /** Weight for density component */
  density: number;
}

/**
 * Readability metrics for German text analysis
 */
export interface ReadabilityMetrics {
  /** Average words per sentence */
  wordsPerSentence: number;
  /** Average word length in characters */
  avgWordLength: number;
  /** Total sentence count */
  sentenceCount: number;
  /** Total word count */
  wordCount: number;
}

/**
 * Markdown structure features detected in text
 */
export interface MarkdownStructure {
  /** Detected headers with level and text */
  headers?: Array<{ level: number; text: string }>;
  /** Number of lists found */
  lists?: number;
  /** Number of code blocks found */
  codeBlocks?: number;
  /** Number of tables found */
  tables?: number;
  /** Whether blockquotes are present */
  blockquotes?: boolean;
}

/**
 * Completeness analysis result
 */
export interface CompletenessAnalysis {
  /** Does chunk start properly? */
  startsWell: boolean;
  /** Does chunk end properly? */
  endsWell: boolean;
  /** Is chunk complete overall? */
  isComplete: boolean;
  /** Penalty factors applied */
  penalties: string[];
}

/**
 * Information density metrics
 */
export interface DensityMetrics {
  /** Unique content token ratio (after stopword removal) */
  uniqueRatio: number;
  /** Has numeric content */
  hasNumbers: boolean;
  /** Count of acronyms (uppercase entities) */
  acronymCount: number;
  /** Content token count (after stopword removal) */
  contentTokenCount: number;
}
