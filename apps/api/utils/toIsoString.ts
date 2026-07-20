/**
 * Normalise a value that is either a Date object or an ISO-8601 string
 * (both can emerge from raw postgres.query() rows depending on the pg driver's
 * type-parser configuration) into a canonical ISO-8601 string.
 *
 * Usage:
 *   toIsoString(row.created_at)   // works for Date | string
 */
export function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Nullable columns: null in, null out. */
export function toIsoOrNull(value: Date | string | null): string | null {
  return value == null ? null : toIsoString(value);
}
