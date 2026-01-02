/**
 * Text Processing Service Types
 */

/**
 * Options for text cleaning operations
 */
export interface CleaningOptions {
  /** Preserve structural elements like page markers */
  preserveStructure?: boolean;
}

/**
 * Options for query normalization
 */
export interface NormalizationOptions {
  /** Convert to lowercase */
  toLowerCase?: boolean;
  /** Fold German umlauts to ASCII */
  foldUmlauts?: boolean;
  /** Normalize unicode numbers (subscripts/superscripts) */
  normalizeNumbers?: boolean;
}
