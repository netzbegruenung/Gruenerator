import { type WebViewOutboundMessage } from '@gruenerator/shared';
import { Directory, File, Paths } from 'expo-file-system';

import { base64ToBytes, shareFile } from '../share';

import { safeCacheFilename } from './downloadPolicy';

type ShareMessage = Extract<WebViewOutboundMessage, { type: 'SHARE_FILE' }>;

const SHARE_DIR = 'webview-share';
const STALE_AFTER_MS = 10 * 60_000;

const UTI_BY_MIME: Record<string, string> = {
  'image/png': 'public.png',
  'image/jpeg': 'public.jpeg',
  'application/pdf': 'com.adobe.pdf',
  'application/zip': 'public.zip-archive',
};

let shareCount = 0;

function pruneStaleShares(root: Directory, now: number): void {
  for (const entry of root.list()) {
    const createdAt = Number.parseInt(entry.name, 10);
    if (entry instanceof Directory && createdAt > now - STALE_AFTER_MS) continue;
    entry.delete();
  }
}

/**
 * Opens the share sheet for a file the page wants shared. `text` is not passed
 * on: a file share through expo-sharing has no caption field.
 *
 * The file is NOT deleted when the sheet resolves: on Android `shareAsync` can
 * resolve once the chooser hands off, before the target app has read the
 * content URI, and the share arrives empty. A multi-page share starts the next
 * page right then, so each share gets its own directory and only directories
 * older than `STALE_AFTER_MS` are cleared.
 */
export async function receiveShare(message: ShareMessage): Promise<void> {
  const now = Date.now();
  const root = new Directory(Paths.cache, SHARE_DIR);
  if (root.exists) pruneStaleShares(root, now);
  shareCount += 1;
  const dir = new Directory(root, `${now}-${shareCount}`);
  dir.create({ intermediates: true });
  const file = new File(dir, safeCacheFilename(message.filename));
  file.write(base64ToBytes(message.data));
  await shareFile(file.uri, {
    mimeType: message.mime,
    dialogTitle: message.title ?? 'Teilen',
    uti: UTI_BY_MIME[message.mime] ?? 'public.data',
  });
}
