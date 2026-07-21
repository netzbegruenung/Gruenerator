/**
 * Escape `%` and `_` so user input can't act as a LIKE wildcard — searching for
 * `100%` must not match every row. The backslash is doubled first, or a typed
 * `\%` would escape our own escape character.
 */
export function likeContainsPattern(query: string): string {
  const escaped = query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}
