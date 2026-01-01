/**
 * Filter Utilities
 * Qdrant filter merging and manipulation
 */

import type { QdrantFilter } from './types.js';

/**
 * Merge two Qdrant filters (supports must/must_not/should)
 */
export function mergeFilters(a: QdrantFilter = {}, b: QdrantFilter = {}): QdrantFilter {
    const out: QdrantFilter = { must: [], must_not: [], should: [] };

    if (Array.isArray(a.must)) out.must!.push(...a.must);
    if (Array.isArray(b.must)) out.must!.push(...b.must);
    if (Array.isArray(a.must_not)) out.must_not!.push(...a.must_not);
    if (Array.isArray(b.must_not)) out.must_not!.push(...b.must_not);
    if (Array.isArray(a.should)) out.should!.push(...a.should);
    if (Array.isArray(b.should)) out.should!.push(...b.should);

    // Clean up empty arrays to keep filter concise
    if (out.must!.length === 0) delete out.must;
    if (out.must_not!.length === 0) delete out.must_not;
    if (out.should!.length === 0) delete out.should;

    return out;
}

/**
 * Check if a filter is empty
 */
export function isEmptyFilter(filter: QdrantFilter): boolean {
    return (
        (!filter.must || filter.must.length === 0) &&
        (!filter.must_not || filter.must_not.length === 0) &&
        (!filter.should || filter.should.length === 0)
    );
}

/**
 * Create a simple match filter
 */
export function createMatchFilter(key: string, value: string | number): QdrantFilter {
    return {
        must: [{ key, match: { value } }]
    };
}

/**
 * Create a range filter
 */
export function createRangeFilter(
    key: string,
    range: { gte?: number; lte?: number; gt?: number; lt?: number }
): QdrantFilter {
    return {
        must: [{ key, range }]
    };
}

/**
 * Create a filter for matching any of the given values
 */
export function createAnyMatchFilter(key: string, values: (string | number)[]): QdrantFilter {
    return {
        must: [{ key, match: { any: values } }]
    };
}
