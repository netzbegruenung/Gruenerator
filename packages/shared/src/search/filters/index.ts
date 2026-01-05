/**
 * Qdrant Filter Builder Module
 *
 * Exports utilities for building Qdrant filter queries.
 */

// Types
export type {
  QdrantFilter,
  QdrantCondition,
  QdrantMatchCondition,
  QdrantMatchAnyCondition,
  QdrantRangeCondition,
  QdrantTextCondition,
  FilterSpec,
  CommonFilterField
} from './types.js';

// Filter builder utilities
export {
  COMMON_FILTER_FIELDS,
  buildQdrantFilter,
  buildQdrantFilterFromSpecs,
  mergeFilters,
  exactMatch,
  anyMatch,
  textMatch,
  rangeMatch,
  hasConditions
} from './QdrantFilterBuilder.js';
