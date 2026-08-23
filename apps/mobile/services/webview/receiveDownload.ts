/**
 * Taking delivery of a file an embedded page produced.
 *
 * The page cannot hand the user a file itself — a synthetic `<a download>`
 * click is ignored by WKWebView, and `navigationPolicy.ts` blocks `data:` on
 * Android — so it posts the bytes over the bridge and this is where they land.
 *
 * The decisions live in `./downloadPolicy.ts`; this module is only the write.
 */

import { type WebViewOutboundMessage } from '@gruenerator/shared';

import { saveImageToGallery } from '../imageStudio';
import { base64ToBytes, shareBytesAsFile } from '../share';

import { pickTarget, safeCacheFilename } from './downloadPolicy';

type DownloadMessage = Extract<WebViewOutboundMessage, { type: 'DOWNLOAD_FILE' }>;

/**
 * Writes the delivered file where it belongs.
 *
 * A gallery save the user declines falls through to the share sheet rather than
 * dead-ending: they asked for a file, and a share sheet still delivers one.
 */
export async function receiveDownload(message: DownloadMessage): Promise<void> {
  const filename = safeCacheFilename(message.filename);

  if (pickTarget(message.mime) === 'gallery') {
    const saved = await saveImageToGallery(message.data, filename);
    if (saved) return;
    // Permission denied or the write failed — `saveImageToGallery` has already
    // told the user; the share sheet is a second chance, not a second error.
  }

  await shareBytesAsFile(base64ToBytes(message.data), filename, 'Datei speichern', message.mime);
}
