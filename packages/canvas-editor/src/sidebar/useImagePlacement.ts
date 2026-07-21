import { useCallback } from 'react';

import { buildPlacementUrl } from '../utils/mediaPlacement';

import { useUserUploads } from './UserUploadsProvider';

import type { UploadSource } from '@gruenerator/shared/media-library';

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

  const place = useCallback(
    async (file: File, source: UploadSource): Promise<PlacedImage> => {
      const item = await upload(file, source);
      if (!item) throw new Error('Upload fehlgeschlagen');
      const name = item.originalFilename ?? item.title ?? file.name;
      const url = buildPlacementUrl(item);
      if (url && onPlaceUrl) onPlaceUrl(url, name);
      return { url, name };
    },
    [upload, onPlaceUrl]
  );

  return { place, isUploading };
}
