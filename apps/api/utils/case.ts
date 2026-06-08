/**
 * Case-conversion helpers for HTTP boundaries.
 *
 * `toCamelCase` deep-converts snake_case object keys (as returned by Postgres
 * rows) to camelCase for JSON responses. Recurses through arrays and nested
 * objects; leaves primitives untouched.
 */

export interface CamelCaseObject {
  [key: string]: unknown;
}

export function toCamelCase(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).reduce<CamelCaseObject>(
      (acc, [key, value]) => {
        const camelKey = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
        acc[camelKey] = toCamelCase(value);
        return acc;
      },
      {}
    );
  }
  return obj;
}
