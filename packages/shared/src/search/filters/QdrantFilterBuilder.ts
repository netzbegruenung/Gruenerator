/**
 * Qdrant Filter Builder
 *
 * Utilities for building Qdrant filter queries from various input formats.
 */

import type {
  QdrantFilter,
  QdrantCondition,
  QdrantMatchCondition,
  QdrantMatchAnyCondition,
  QdrantRangeCondition,
  QdrantTextCondition,
  FilterSpec,
  CommonFilterField,
} from './types.js';

/**
 * Common filterable fields used across collections
 */
export const COMMON_FILTER_FIELDS: CommonFilterField[] = [
  'primary_category',
  'content_type',
  'subcategories',
  'region',
  'country',
  'platform',
];

/**
 * Build a Qdrant filter from a key-value object.
 * Converts simple {key: value} pairs to Qdrant filter format.
 *
 * @param filters - Object with field names and values
 * @param filterFields - Optional list of allowed field names (defaults to COMMON_FILTER_FIELDS)
 * @returns Qdrant filter or null if no valid filters
 *
 * @example
 * ```ts
 * const filter = buildQdrantFilter({
 *   platform: 'instagram',
 *   country: 'DE'
 * });
 * // Returns: { must: [{ key: 'platform', match: { value: 'instagram' } }, ...] }
 * ```
 */
export function buildQdrantFilter(
  filters: Record<string, string | number | boolean | undefined> | null | undefined,
  filterFields: string[] = COMMON_FILTER_FIELDS
): QdrantFilter | null {
  if (!filters) return null;

  const must: QdrantCondition[] = [];

  for (const key of filterFields) {
    const value = filters[key];
    if (value !== undefined && value !== null && value !== '') {
      must.push({
        key,
        match: { value },
      } as QdrantMatchCondition);
    }
  }

  return must.length > 0 ? { must } : null;
}

/**
 * Build a filter from an array of FilterSpec objects.
 * Supports more complex matching including "any", "text", and "range".
 *
 * @param specs - Array of filter specifications
 * @returns Qdrant filter or null if no specs provided
 *
 * @example
 * ```ts
 * const filter = buildQdrantFilterFromSpecs([
 *   { field: 'platform', value: ['instagram', 'facebook'], matchType: 'any' },
 *   { field: 'country', value: 'DE', matchType: 'exact' }
 * ]);
 * ```
 */
export function buildQdrantFilterFromSpecs(specs: FilterSpec[]): QdrantFilter | null {
  if (!specs || specs.length === 0) return null;

  const must: QdrantCondition[] = [];

  for (const spec of specs) {
    const { field, value, matchType = 'exact', rangeOp } = spec;

    if (value === undefined || value === null) continue;

    switch (matchType) {
      case 'any':
        if (Array.isArray(value)) {
          must.push({
            key: field,
            match: { any: value },
          } as QdrantMatchAnyCondition);
        }
        break;

      case 'text':
        if (typeof value === 'string') {
          must.push({
            key: field,
            match: { text: value },
          } as QdrantTextCondition);
        }
        break;

      case 'range':
        if (typeof value === 'number' && rangeOp) {
          must.push({
            key: field,
            range: { [rangeOp]: value },
          } as QdrantRangeCondition);
        }
        break;

      case 'exact':
      default:
        if (!Array.isArray(value)) {
          must.push({
            key: field,
            match: { value },
          } as QdrantMatchCondition);
        }
        break;
    }
  }

  return must.length > 0 ? { must } : null;
}

/**
 * Merge multiple Qdrant filters into one.
 * Combines all conditions from each filter.
 *
 * @param filters - Array of filters to merge
 * @returns Merged filter or null if all filters are empty
 *
 * @example
 * ```ts
 * const merged = mergeFilters(filterA, filterB);
 * ```
 */
export function mergeFilters(...filters: (QdrantFilter | null | undefined)[]): QdrantFilter | null {
  const must: QdrantCondition[] = [];
  const should: QdrantCondition[] = [];
  const must_not: QdrantCondition[] = [];

  for (const filter of filters) {
    if (!filter) continue;

    if (filter.must) {
      must.push(...filter.must);
    }
    if (filter.should) {
      should.push(...filter.should);
    }
    if (filter.must_not) {
      must_not.push(...filter.must_not);
    }
  }

  if (must.length === 0 && should.length === 0 && must_not.length === 0) {
    return null;
  }

  const result: QdrantFilter = {};
  if (must.length > 0) result.must = must;
  if (should.length > 0) result.should = should;
  if (must_not.length > 0) result.must_not = must_not;

  return result;
}

/**
 * Create a simple exact match condition.
 *
 * @param field - Field name
 * @param value - Value to match
 * @returns Single match condition
 */
export function exactMatch(field: string, value: string | number | boolean): QdrantMatchCondition {
  return { key: field, match: { value } };
}

/**
 * Create an "any of" match condition.
 *
 * @param field - Field name
 * @param values - Values to match (any)
 * @returns Match any condition
 */
export function anyMatch(field: string, values: (string | number)[]): QdrantMatchAnyCondition {
  return { key: field, match: { any: values } };
}

/**
 * Create a text match condition.
 *
 * @param field - Field name
 * @param text - Text to match
 * @returns Text match condition
 */
export function textMatch(field: string, text: string): QdrantTextCondition {
  return { key: field, match: { text } };
}

/**
 * Create a range condition.
 *
 * @param field - Field name
 * @param range - Range specification
 * @returns Range condition
 */
export function rangeMatch(
  field: string,
  range: { gt?: number; gte?: number; lt?: number; lte?: number }
): QdrantRangeCondition {
  return { key: field, range };
}

/**
 * Check if a filter has any conditions.
 *
 * @param filter - Filter to check
 * @returns True if filter has at least one condition
 */
export function hasConditions(filter: QdrantFilter | null | undefined): boolean {
  if (!filter) return false;
  return (
    (filter.must?.length || 0) > 0 ||
    (filter.should?.length || 0) > 0 ||
    (filter.must_not?.length || 0) > 0
  );
}
