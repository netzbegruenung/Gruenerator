import { z } from 'zod';

/**
 * Bridge helper for Express 5 route params.
 *
 * Express 5 types allow params to be `string | string[]`.
 * This safely narrows to `string` at runtime.
 */
export function getParam(params: Record<string, string | string[]>, name: string): string {
  const val = params[name];
  return Array.isArray(val) ? val[0] : val;
}

const uuidSchema = z.guid();

/**
 * True when `value` has the shape Postgres accepts for a `uuid` column.
 * Use it to answer 404 for a malformed id instead of letting the query fail
 * with 22P02 (`invalid input syntax for type uuid`), which surfaces as a 500.
 */
export function isUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}
