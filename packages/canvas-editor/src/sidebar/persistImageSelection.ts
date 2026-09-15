import { downscaleImageForUpload } from '../utils/userImageUtils';

import type { StockImageAttribution } from '../common/imageSourceTypes';

type ImageChange = (
  file: File | null,
  objectUrl?: string,
  attribution?: StockImageAttribution | null
) => void;

type UploadImage = (file: Blob, opts?: { filename?: string }) => Promise<string | null>;

export interface PersistImageResult {
  /** The URL now backing the canvas background. */
  url: string;
  /**
   * True when the image was uploaded to a durable URL that survives reloads.
   * False when no upload service was injected or the upload failed — in which
   * case `url` is a session-local `blob:` URL that will not persist.
   */
  persisted: boolean;
}

/**
 * Apply a freshly-picked local image as the canvas background, then ensure it is
 * backed by a durable URL.
 *
 * The chosen `currentImageSrc` is what gets written into the collaborative
 * document, so a `blob:` object URL would be dead on the next reload (white
 * background). This helper shows the blob immediately for an instant preview,
 * then uploads the file and swaps `currentImageSrc` to the returned durable URL
 * — the value that actually persists.
 *
 * When no `uploadImage` service is injected the blob preview is kept as-is and
 * `persisted` is false (callers should surface that it won't survive a reload).
 */
export async function persistImageSelection(
  file: File,
  attribution: StockImageAttribution | null,
  onImageChange: ImageChange,
  uploadImage?: UploadImage
): Promise<PersistImageResult> {
  // Unsplash `regular` originals and phone photos reach 4-8k px / several MB,
  // yet the canvas only renders them at ~1080px (export is container x 2).
  // Downscale once here so the blob preview, the upload and every later
  // canvas load of the durable URL stay small. `downscaleImageForUpload`
  // returns the original file unchanged on any failure or when it is already
  // small enough.
  const workingFile = await downscaleImageForUpload(file);
  const blobUrl = URL.createObjectURL(workingFile);
  // Optimistic preview — instant, unchanged UX.
  onImageChange(workingFile, blobUrl, attribution);

  if (!uploadImage) {
    return { url: blobUrl, persisted: false };
  }

  const persistentUrl = await uploadImage(workingFile, { filename: workingFile.name });
  if (!persistentUrl) {
    // Soft failure — keep the preview but report it isn't durable.
    return { url: blobUrl, persisted: false };
  }

  // Swap the persisted reference to the durable URL, then free the blob.
  onImageChange(workingFile, persistentUrl, attribution);
  URL.revokeObjectURL(blobUrl);
  return { url: persistentUrl, persisted: true };
}
