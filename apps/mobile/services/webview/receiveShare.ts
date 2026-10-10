import { type WebViewOutboundMessage } from '@gruenerator/shared';
import { Directory, File, Paths } from 'expo-file-system';

import { base64ToBytes, shareFile } from '../share';

import { safeCacheFilename } from './downloadPolicy';

type ShareMessage = Extract<WebViewOutboundMessage, { type: 'SHARE_FILE' }>;

const SHARE_DIR = 'webview-share';

/**
 * Opens the share sheet for a file the page wants shared. `text` is not passed
 * on: a file share through expo-sharing has no caption field.
 *
 * The file is NOT deleted when the sheet resolves: on Android `shareAsync` can
 * resolve once the chooser hands off, before the target app has read the
 * content URI, and the share arrives empty. Each share clears the directory
 * instead, so at most one file stays behind.
 */
export async function receiveShare(message: ShareMessage): Promise<void> {
  const dir = new Directory(Paths.cache, SHARE_DIR);
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const file = new File(dir, safeCacheFilename(message.filename));
  file.write(base64ToBytes(message.data));
  await shareFile(file.uri, { mimeType: message.mime, dialogTitle: message.title ?? 'Teilen' });
}
