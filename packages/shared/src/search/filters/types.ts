/**
 * Qdrant Filter Types
 *
 * Type definitions for building Qdrant filter queries.
 */

/**
 * Single match condition for a field
 */
export interface QdrantMatchCondition {
  key: string;
  match: {
    value: string | number | boolean;
  };
}

/**
 * Match any of the values
 */
export interface QdrantMatchAnyCondition {
  key: string;
  match: {
    any: (string | number)[];
  };
}

/**
 * Range condition for numeric fields
 */
export interface QdrantRangeCondition {
  key: string;
  range: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
}

/**
 * Text match condition (for full-text fields)
 */
export interface QdrantTextCondition {
  key: string;
  match: {
    text: string;
  };
}

/**
 * Union of all condition types
 */
export type QdrantCondition =
  | QdrantMatchCondition
  | QdrantMatchAnyCondition
  | QdrantRangeCondition
  | QdrantTextCondition;

/**
 * Qdrant filter with must/should/must_not arrays
 */
export interface QdrantFilter {
  must?: QdrantCondition[];
  should?: QdrantCondition[];
  must_not?: QdrantCondition[];
}

/**
 * Filter specification for building filters from user input
 */
export interface FilterSpec {
  /** Field name in the payload */
  field: string;
  /** Value to match (string, number, or array for "any" matching) */
  value: string | number | boolean | (string | number)[];
  /** Type of match to perform */
  matchType?: 'exact' | 'any' | 'text' | 'range';
  /** For range matching: comparison operator */
  rangeOp?: 'gt' | 'gte' | 'lt' | 'lte';
}

/**
 * Common filter field names used across collections
 */
export type CommonFilterField =
  | 'primary_category'
  | 'content_type'
  | 'subcategories'
  | 'region'
  | 'country'
  | 'platform';
