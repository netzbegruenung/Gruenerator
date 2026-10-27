import { useCallback } from 'react';

import { useCanvasEditorServices } from '../CanvasEditorProvider';
import { plainImageUrls, type CanvasUploadSource } from '../hostServices';

import { useUserUploads } from './UserUploadsProvider';

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
 * `'Upload fehlgeschlagen'` when the upload fails so callers can surface it.
 */
export function useImagePlacement(onPlaceUrl?: (url: string, fileName: string) => void) {
  const { upload, isUploading } = useUserUploads();
  const { imageUrls = plainImageUrls } = useCanvasEditorServices();

  const place = useCallback(
    async (file: File, source: CanvasUploadSource): Promise<PlacedImage> => {
      const item = await upload(file, source);
      if (!item) throw new Error('Upload fehlgeschlagen');
      const name = item.originalFilename ?? item.title ?? file.name;
      const url = imageUrls.placementUrl(item);
      if (url && onPlaceUrl) onPlaceUrl(url, name);
      return { url, name };
    },
    [upload, onPlaceUrl, imageUrls]
  );

  return { place, isUploading };
}
