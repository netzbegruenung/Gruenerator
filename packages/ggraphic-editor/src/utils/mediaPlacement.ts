// SPDX-License-Identifier: MPL-2.0
import { messages } from '@ggraphic/editor/i18n/messages';
import { downscaleImageForUpload } from '@ggraphic/editor/utils/userImageUtils';

import type { CanvasImageUrlService } from '../hostServices';

/**
 * A stored image as the File a background pick hands to `onImageChange`. The
 * canvas renders the host's variant anyway; the stored original can be many MB.
 */
export async function fetchShareImageFile(
  url: string,
  filename: string,
  urls: CanvasImageUrlService
): Promise<File> {
  const response = await fetch(urls.previewUrl(url));
  if (!response.ok) throw new Error(messages().errors.imageLoad);
  const blob = await response.blob();
  const rawFile = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  // This File backs the auto-save `originalImage`, so it should be the working
  // size, not the raw original.
  return downscaleImageForUpload(rawFile);
}
