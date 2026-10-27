import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { useCallback } from 'react';

import type { StockImageAttribution } from '@ggraphic/editor/common/imageSourceTypes';

/**
 * Unsplash API Terms: every placement of an Unsplash photo pings its
 * `downloadLocation`. Shared by every path that puts a photo on the canvas.
 */
export function useTrackUnsplashDownload() {
  const { trackUnsplashDownloadLive, trackUnsplashDownload } = useCanvasEditorServices();
  return useCallback(
    (filename: string, attribution: StockImageAttribution | undefined) => {
      const downloadLocation = attribution?.downloadLocation;
      if (!downloadLocation) return;
      if (trackUnsplashDownloadLive) void trackUnsplashDownloadLive(downloadLocation);
      else if (trackUnsplashDownload) void trackUnsplashDownload({ filename, attribution });
    },
    [trackUnsplashDownloadLive, trackUnsplashDownload]
  );
}
