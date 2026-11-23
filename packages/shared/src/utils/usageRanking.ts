/**
 * Shared usage-based ranking so server (list endpoints) and client (static
 * registries) order items identically.
 *
 * Ranking: items the user has used come before never-used items; among used
 * items, most-recently-used first, with use-count as a tiebreak. Never-used
 * items keep their incoming order (rely on a stable Array.prototype.sort, which
 * all supported engines provide), so callers feed in a pre-ordered array
 * (registry `order`, alphabetical, etc.).
 */

export interface UsageStat {
  useCount: number;
  /** Date or ISO string (server uses Date, client receives a string). */
  lastUsedAt: Date | string;
}

export type UsageMap = Map<string, UsageStat> | Record<string, UsageStat>;

function getStat(map: UsageMap, id: string): UsageStat | undefined {
  return map instanceof Map ? map.get(id) : map[id];
}

function toMillis(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Comparator for two usage stats (either may be undefined for never-used).
 * Returns negative if `a` should rank before `b`.
 */
export function compareUsageStats(a: UsageStat | undefined, b: UsageStat | undefined): number {
  if (a && !b) return -1;
  if (!a && b) return 1;
  if (!a || !b) return 0; // both never-used → preserve incoming order
  const recency = toMillis(b.lastUsedAt) - toMillis(a.lastUsedAt);
  if (recency !== 0) return recency;
  return b.useCount - a.useCount;
}

/**
 * Stable-sort a pre-ordered array so used items float to the top by recency
 * (then count). Never-used items keep their incoming order.
 */
export function sortByUsage<T>(items: T[], getId: (item: T) => string, map: UsageMap): T[] {
  return [...items].sort((a, b) =>
    compareUsageStats(getStat(map, getId(a)), getStat(map, getId(b)))
  );
}

/**
 * "Most used" ranking for the sidebar and the "Empfohlen" sort: used items
 * first, by use count (then most recent use); never-used items follow in the
 * order of `fallback` (e.g. last activity), so a new user still sees something.
 */
export function rankByUsage<T>(
  items: readonly T[],
  getId: (item: T) => string,
  map: UsageMap,
  fallback: (a: T, b: T) => number
): T[] {
  return [...items].sort((a, b) => {
    const sa = getStat(map, getId(a));
    const sb = getStat(map, getId(b));
    if (sa && sb) {
      return sb.useCount - sa.useCount || toMillis(sb.lastUsedAt) - toMillis(sa.lastUsedAt);
    }
    if (sa) return -1;
    if (sb) return 1;
    return fallback(a, b);
  });
}
