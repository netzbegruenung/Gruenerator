/**
 * Type definitions for QueryIntentService
 * Query analysis, intent detection, and filter generation for German/English queries
 */

/**
 * Intent types that can be detected from user queries
 */
export type IntentType =
  | 'definition'
  | 'howto'
  | 'factual'
  | 'comparison'
  | 'legal'
  | 'list'
  | 'table'
  | 'code'
  | 'summary'
  | 'timeline'
  | 'general'
  | 'unknown';

/**
 * Detected language from query
 */
export type Language = 'de' | 'en' | 'unknown';

/**
 * Additional flags detected in queries
 */
export interface IntentFlags {
  /** Query contains numeric values */
  hasNumbers?: boolean;
  /** Additional custom flags */
  [key: string]: unknown;
}

/**
 * Result of intent detection analysis
 */
export interface IntentDetectionResult {
  /** Detected intent type */
  type: IntentType;
  /** Detected language */
  language: Language;
  /** Confidence score 0-1 */
  confidence: number;
  /** Extracted keywords from query */
  keywords?: string[];
  /** Additional flags detected */
  flags?: IntentFlags;
}

/**
 * Content type preferences based on detected intent
 */
export interface ContentPreferences {
  /** Preferred content types in priority order */
  preferredTypes: string[];
  /** Boost factors per content type */
  boost: Record<string, number>;
}

/**
 * Qdrant filter condition for matching
 */
export interface FilterCondition {
  /** Field name to match on */
  key: string;
  /** Match criteria */
  match?: {
    /** Single value to match */
    value?: string | number | boolean;
    /** Array of values to match any of */
    any?: Array<string | number | boolean>;
  };
}

/**
 * Qdrant filter structure
 */
export interface QdrantFilter {
  /** Conditions that must all match */
  must?: FilterCondition[];
  /** Conditions where at least one must match */
  should?: FilterCondition[];
  /** Conditions that must not match */
  must_not?: FilterCondition[];
}

/**
 * Subcategory filters extracted from natural language
 */
export interface SubcategoryFilters {
  /** Article type (e.g., 'literatur', 'praxishilfe', 'faq') */
  article_type?: string;
  /** Category or topic */
  category?: string;
  /** Section within a source */
  section?: string;
}

/**
 * Document scope detection result
 */
export interface DocumentScope {
  /** Collection IDs to search */
  collections: string[];
  /** Optional document title filter */
  documentTitleFilter: string | null;
  /** Detected phrase that triggered this scope */
  detectedPhrase: string | null;
  /** Subcategory filters to apply */
  subcategoryFilters: SubcategoryFilters;
}

/**
 * Pattern matching configuration for intent detection
 */
export interface IntentPattern {
  /** Intent type this pattern matches */
  type: IntentType;
  /** Regular expression for matching */
  re: RegExp;
}

/**
 * Document scope pattern configuration
 */
export interface DocumentScopePattern {
  /** Regular expression for matching */
  re: RegExp;
  /** Collection IDs to use when matched */
  collections: string[];
  /** Optional title filter to apply */
  titleFilter: string | null;
}
