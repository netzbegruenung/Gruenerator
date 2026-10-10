import { Directory, File, Paths } from 'expo-file-system';

import { safeCacheFilename } from './webview/downloadPolicy';

const SHARE_DIR = 'webview-share';
const STALE_AFTER_MS = 10 * 60_000;

let shareCount = 0;

function pruneStaleShares(root: Directory, now: number): void {
  for (const entry of root.list()) {
    const createdAt = Number.parseInt(entry.name, 10);
    if (entry instanceof Directory && createdAt > now - STALE_AFTER_MS) continue;
    entry.delete();
  }
}

/**
 * Writes bytes to a cache file for the share sheet and keeps it there.
 *
 * The file is NOT deleted when the sheet resolves: on Android `shareAsync` can
 * resolve once the chooser hands off, before the target app has read the
 * content URI, and the share arrives empty. A multi-page share starts the next
 * page right then, so each share gets its own directory and only directories
 * older than `STALE_AFTER_MS` are cleared.
 */
export function writeShareFile(bytes: Uint8Array, fileName: string): File {
  const now = Date.now();
  const root = new Directory(Paths.cache, SHARE_DIR);
  if (root.exists) pruneStaleShares(root, now);
  shareCount += 1;
  const dir = new Directory(root, `${now}-${shareCount}`);
  dir.create({ intermediates: true });
  const file = new File(dir, safeCacheFilename(fileName));
  file.write(bytes);
  return file;
}
