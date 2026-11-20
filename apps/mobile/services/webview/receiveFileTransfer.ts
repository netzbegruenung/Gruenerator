/**
 * The IO half of `fileTransfer.ts`: each transfer is a file in its own cache
 * directory, written chunk by chunk through one open handle, then delivered
 * like a `DOWNLOAD_FILE` — images and videos to the gallery, the rest to the
 * share sheet.
 */

import { type WebViewInboundMessage } from '@gruenerator/shared';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import { base64ToBytes, shareLocalFile } from '../share';

import { pickTarget, safeCacheFilename } from './downloadPolicy';
import { createFileTransferReceiver, type TransferTarget } from './fileTransfer';
import { saveFileToGallery } from './receiveDownload';

const TRANSFER_DIR = 'webview-transfer';

/** Older transfer directories are leftovers of a crash or a share that has long been read. */
const STALE_AFTER_MS = 60 * 60_000;

let transferCount = 0;

interface CacheTarget extends TransferTarget {
  file: File;
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

function createCacheTarget(filename: string): CacheTarget {
  const now = Date.now();
  const root = new Directory(Paths.cache, TRANSFER_DIR);
  if (root.exists) pruneStale(root, now);
  transferCount += 1;
  const dir = new Directory(root, `${now}-${transferCount}`);
  dir.create({ intermediates: true });
  const file = new File(dir, safeCacheFilename(filename));
  file.create();
  const handle = file.open(FileMode.WriteOnly);
  return {
    file,
    write: (bytes) => handle.writeBytesSync(bytes),
    close: () => handle.close(),
    discard: () => {
      handle.close();
      dir.delete();
    },
  };
}

/**
 * A receiver for one WebView screen. `reply` posts into the page; dispose it
 * with the screen, so a half-sent file does not stay in the cache.
 */
export function createCacheFileTransferReceiver(reply: (message: WebViewInboundMessage) => void) {
  return createFileTransferReceiver<CacheTarget>({
    create: createCacheTarget,
    decode: base64ToBytes,
    reply,
    async deliver(target, filename, mime) {
      // A gallery save the user declines falls through to the share sheet, as
      // for `DOWNLOAD_FILE`: they asked for a file, a share sheet still delivers one.
      if (pickTarget(mime) === 'gallery' && (await saveFileToGallery(target.file, mime))) return;
      await shareLocalFile(target.file.uri, mime, `${safeCacheFilename(filename)} speichern`);
    },
  });
}
