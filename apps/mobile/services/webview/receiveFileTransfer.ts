/**
 * The IO half of `fileTransfer.ts`: each transfer is a file in its own cache
 * directory, written chunk by chunk through one open handle, then delivered
 * like a `DOWNLOAD_FILE` — images and videos to the gallery, the rest to the
 * share sheet.
 */

import { type WebViewInboundMessage } from '@gruenerator/shared';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { saveFileToGallery } from '../imageStudio';
import { base64ToBytes, shareLocalFile } from '../share';

import { pickTarget, safeCacheFilename } from './downloadPolicy';
import { createFileTransferReceiver, type TransferTarget } from './fileTransfer';

const TRANSFER_DIR = 'webview-transfer';

/** Older transfer directories are leftovers of a crash or a share that has long been read. */
const STALE_AFTER_MS = 60 * 60_000;

let transferCount = 0;

interface CacheTarget extends TransferTarget {
  file: File;
  dir: Directory;
}

function pruneStale(root: Directory, now: number): void {
  for (const entry of root.list()) {
    const createdAt = Number.parseInt(entry.name, 10);
    if (entry instanceof Directory && createdAt > now - STALE_AFTER_MS) continue;
    try {
      entry.delete();
    } catch {
      // In use by a share sheet that is still open; next time.
    }
  }
}

function pruneTransferCache(now: number): void {
  const root = new Directory(Paths.cache, TRANSFER_DIR);
  try {
    if (root.exists) pruneStale(root, now);
  } catch {
    // Listing failed; next time.
  }
}

function createCacheTarget(filename: string): CacheTarget {
  const now = Date.now();
  const root = new Directory(Paths.cache, TRANSFER_DIR);
  pruneTransferCache(now);
  transferCount += 1;
  const dir = new Directory(root, `${now}-${transferCount}`);
  dir.create({ intermediates: true });
  const file = new File(dir, safeCacheFilename(filename));
  file.create();
  const handle = file.open(FileMode.WriteOnly);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    handle.close();
  };
  return {
    file,
    dir,
    write: (bytes) => handle.writeBytesSync(bytes),
    close,
    discard: () => {
      try {
        close();
      } finally {
        dir.delete();
      }
    },
  };
}

/**
 * A receiver for one WebView screen. `reply` posts into the page; `schedule`
 * runs a delivery after the ones before it (the screen's share queue: a second
 * share sheet or permission prompt cannot open over the first). Dispose it with
 * the screen, so a half-sent file does not stay in the cache.
 */
export function createCacheFileTransferReceiver(
  reply: (message: WebViewInboundMessage) => void,
  schedule: (task: () => Promise<void>) => Promise<void>
) {
  // Leftovers of earlier screens go when the next one opens, not only when
  // the next transfer starts.
  pruneTransferCache(Date.now());
  return createFileTransferReceiver<CacheTarget>({
    create: createCacheTarget,
    decode: base64ToBytes,
    reply,
    deliver: (target, filename, mime) =>
      schedule(async () => {
        // A gallery save the user declines falls through to the share sheet,
        // as for `DOWNLOAD_FILE`: they asked for a file, a share sheet still
        // delivers one.
        if (pickTarget(mime) === 'gallery' && (await saveFileToGallery(target.file.uri, mime))) {
          // The gallery has its own copy now. A shared file stays until it is
          // stale: the receiving app may read it after the sheet resolved.
          try {
            target.dir.delete();
          } catch {
            // The stale sweep gets it.
          }
          return;
        }
        await shareLocalFile(target.file.uri, mime, `${safeCacheFilename(filename)} speichern`);
      }),
  });
}
