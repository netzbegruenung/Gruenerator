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
  const blobUrl = URL.createObjectURL(file);
  // Optimistic preview — instant, unchanged UX.
  onImageChange(file, blobUrl, attribution);

  if (!uploadImage) {
    return { url: blobUrl, persisted: false };
  }

  const persistentUrl = await uploadImage(file, { filename: file.name });
  if (!persistentUrl) {
    // Soft failure — keep the preview but report it isn't durable.
    return { url: blobUrl, persisted: false };
  }

  // Swap the persisted reference to the durable URL, then free the blob.
  onImageChange(file, persistentUrl, attribution);
  URL.revokeObjectURL(blobUrl);
  return { url: persistentUrl, persisted: true };
}
