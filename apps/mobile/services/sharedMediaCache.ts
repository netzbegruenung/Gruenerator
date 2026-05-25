/**
 * Shared-media local cache.
 *
 * A share token addresses immutable content (`/share/<token>` always returns the
 * same bytes), so its downloaded/created file is safe to cache by token in the
 * OS-managed cache directory. The in-app viewer (`pushed-content`) reads from here
 * cache-first; image creation (`useImageAutoSave`) writes here so app-created images
 * never need a download round-trip. Web-created content simply misses and downloads
 * once, then lives here too.
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

/**
 * Persist an in-app-created image (data URI or raw base64) to the share cache so the
 * viewer can show it instantly without downloading. Best-effort: a write failure must
 * not break the surrounding save flow (the viewer falls back to download on a miss).
 */
export function writeImageToShareCache(shareToken: string, imageData: string): void {
  try {
    const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    getCachedShareFile(shareToken, 'png').write(bytes);
  } catch (error) {
    console.warn('[sharedMediaCache] Failed to cache created image:', error);
  }
}
