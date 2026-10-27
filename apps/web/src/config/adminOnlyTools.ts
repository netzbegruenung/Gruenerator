/**
 * Tools only instance admins see and open while they are being tried out. The
 * path is the key every surface shares (Studio tiles, quick starts, search,
 * favourites); the page itself is gated with `RequireAdmin` as well.
 */
const ADMIN_ONLY_PATHS: ReadonlySet<string> = new Set(['/studio/videoeditor']);

export function isToolVisibleTo(path: string | null | undefined, isAdmin: boolean): boolean {
  return isAdmin || path == null || !ADMIN_ONLY_PATHS.has(path);
}
