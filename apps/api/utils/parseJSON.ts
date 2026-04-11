/**
 * Typed JSON.parse wrapper. Casts the result to T.
 * Use when you know the expected shape of the parsed data.
 */
export function parseJSON<T>(str: string): T {
  return JSON.parse(str) as T;
}
