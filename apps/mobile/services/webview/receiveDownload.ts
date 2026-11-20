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
import { type File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Alert } from 'react-native';

import { getErrorMessage } from '../../utils/errors';
import { alertSavedToGallery } from '../gallery';
import { saveImageToGallery } from '../imageStudio';
import { base64ToBytes, shareBytesAsFile } from '../share';
import { writeShareFile } from '../shareCache';

import { pickTarget, safeCacheFilename } from './downloadPolicy';

type DownloadMessage = Extract<WebViewOutboundMessage, { type: 'DOWNLOAD_FILE' }>;

const galleryLabel = (mime: string) =>
  mime.startsWith('video/')
    ? { saved: 'Das Video wurde in der Galerie gespeichert.', noun: 'Videos' }
    : { saved: 'Das Bild wurde in der Galerie gespeichert.', noun: 'Bilder' };

/** True when the file is in the gallery; false sends it on to the share sheet. */
export async function saveFileToGallery(file: File, mime: string): Promise<boolean> {
  const label = galleryLabel(mime);
  try {
    // Write-only: saving only, never reading the library.
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      Alert.alert(
        'Galerie-Berechtigung',
        `Bitte erlaube den Zugriff auf die Galerie, um ${label.noun} zu speichern.`
      );
      return false;
    }
    const asset = await MediaLibrary.Asset.create(file.uri);
    alertSavedToGallery(asset.id, label.saved);
    return true;
  } catch (error: unknown) {
    console.warn('[WebViewDownload] gallery save failed:', getErrorMessage(error));
    return false;
  }
}

/**
 * Writes the delivered file where it belongs.
 *
 * A gallery save the user declines falls through to the share sheet rather than
 * dead-ending: they asked for a file, and a share sheet still delivers one.
 */
export async function receiveDownload(message: DownloadMessage): Promise<void> {
  const filename = safeCacheFilename(message.filename);

  if (pickTarget(message.mime) === 'gallery') {
    const saved = message.mime.toLowerCase().startsWith('image/')
      ? await saveImageToGallery(message.data, filename)
      : await saveFileToGallery(
          writeShareFile(base64ToBytes(message.data), filename),
          message.mime
        );
    if (saved) return;
    // Permission denied or the write failed — `saveImageToGallery` has already
    // told the user; the share sheet is a second chance, not a second error.
  }

  await shareBytesAsFile(base64ToBytes(message.data), filename, 'Datei speichern', message.mime);
}
