/**
 * Shared-media local cache.
 *
 * A share token addresses immutable content (`/share/<token>` always returns the
 * same bytes), so its downloaded/created file is safe to cache by token in the
 * OS-managed cache directory. The in-app viewer (`pushed-content`) reads from here
 * cache-first; content it has not seen yet downloads once, then lives here too.
 */

import { File, Directory, Paths } from 'expo-file-system';

const CACHE_SUBDIR = 'pushed-content';

/**
 * The on-disk cache file for a share token. Reader and writers must resolve the
 * path the same way, so both go through here. Ensures the parent dir exists.
 */
export function getCachedShareFile(shareToken: string, ext: 'png' | 'mp4' = 'png'): File {
  const dir = new Directory(Paths.cache, CACHE_SUBDIR);
  dir.create({ idempotent: true });
  return new File(dir, `pushed_${shareToken}.${ext}`);
}
