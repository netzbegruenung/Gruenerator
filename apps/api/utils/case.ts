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
  // A Date is `typeof 'object'` but has no enumerable own properties, so the
  // generic branch below rebuilt it as `{}` — the timestamp vanished from the
  // response with no error anywhere. `pg` hands back every TIMESTAMPTZ column as
  // a Date, so this hit every date on every endpoint that camel-cases its rows;
  // `/share/recent` shipping `createdAt: {}` took the mobile Studio tab down
  // (`{}` has no `localeCompare`). Serialise it the way JSON.stringify would.
  if (obj instanceof Date) {
    return obj.toISOString();
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
