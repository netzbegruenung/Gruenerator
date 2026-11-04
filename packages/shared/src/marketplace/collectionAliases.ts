/**
 * F0 — ids that were renamed; old shared links keep resolving.
 *
 * A leaf module without imports: the API reads it through the
 * `@gruenerator/shared/marketplace/collection-aliases` subpath, and the
 * marketplace barrel would drag the React Query hooks into the server
 * process (the boot smoke test fails on `@tanstack/react-query`).
 */
export const LEGACY_COLLECTION_ALIASES = {
  'wahlkampf-moritz': 'mustergruen-wahlkampf',
} as const;
