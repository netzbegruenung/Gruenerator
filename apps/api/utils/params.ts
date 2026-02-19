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
