import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { plainImageUrls, type CanvasUploadSource } from '@ggraphic/editor/hostServices';
import { useMessages } from '@ggraphic/editor/i18n/messages';
import { useUserUploads } from '@ggraphic/editor/sidebar/UserUploadsProvider';
import { useCallback } from 'react';

export interface PlacedImage {
  /** Durable, placeable URL for the uploaded file (null if none could be resolved). */
  url: string | null;
  /** Display name for the placed image. */
  name: string;
}

/**
 * Single upload-then-place flow shared by the generator tools and the Uploads
 * tab. Uploads `file` with the given source, resolves a durable URL, and — when
 * `onPlaceUrl` is wired — places it straight onto the canvas. Throws
 * t.sidebar.uploadFailed when the upload fails so callers can surface it.
 */
export function useImagePlacement(onPlaceUrl?: (url: string, fileName: string) => void) {
  const t = useMessages();
  const { upload, isUploading } = useUserUploads();
  const { imageUrls = plainImageUrls } = useCanvasEditorServices();

  const place = useCallback(
    async (file: File, source: CanvasUploadSource): Promise<PlacedImage> => {
      const item = await upload(file, source);
      if (!item) throw new Error(t.sidebar.uploadFailed);
      const name = item.originalFilename ?? item.title ?? file.name;
      const url = imageUrls.placementUrl(item);
      if (url && onPlaceUrl) onPlaceUrl(url, name);
      return { url, name };
    },
    [t, upload, onPlaceUrl, imageUrls]
  );

  return { place, isUploading };
}
