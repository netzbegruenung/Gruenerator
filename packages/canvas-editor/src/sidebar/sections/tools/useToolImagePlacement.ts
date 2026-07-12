import { useCallback } from 'react';

import { buildPlacementUrl } from '../../../utils/mediaPlacement';
import { useUserUploads } from '../../UserUploadsProvider';

import type { ToolPanelSuccess } from './ToolPanel';

interface Options {
  /** When present, the generated image is placed straight onto the canvas. */
  onPlaceImageUrl?: (url: string, fileName: string) => void;
  /** Fallback nudge to the Uploads tab when direct placement isn't wired. */
  onJumpToUploads?: () => void;
}

/**
 * Shared finish-step for the generator tools: uploads the produced file to the
 * media library (durable URL) and — when `onPlaceImageUrl` is available — places
 * it straight onto the canvas instead of only adding it to Uploads. Returns the
 * `ToolPanelSuccess` to display.
 */
export function useToolImagePlacement({ onPlaceImageUrl, onJumpToUploads }: Options) {
  const { upload, isUploading } = useUserUploads();

  const finish = useCallback(
    async (file: File): Promise<ToolPanelSuccess> => {
      const objectUrl = URL.createObjectURL(file);

      if (onPlaceImageUrl) {
        // 'canvas-element': durable share URL, but excluded from the Uploads tab
        // and Mediathek — tool output lives on the canvas, never in the library.
        const item = await upload(file, 'canvas-element');
        if (!item) throw new Error('Upload fehlgeschlagen');
        const name = item.originalFilename ?? file.name;
        const url = buildPlacementUrl(item);
        if (url) onPlaceImageUrl(url, name);
        return { thumbnailUrl: objectUrl, itemName: name, placedOnCanvas: true };
      }

      // Fallback (no canvas placement wired): keep the old add-to-Uploads flow.
      const item = await upload(file);
      if (!item) throw new Error('Upload fehlgeschlagen');
      const name = item.originalFilename ?? item.title ?? file.name;
      return { thumbnailUrl: objectUrl, itemName: name, onJumpToUploads };
    },
    [upload, onPlaceImageUrl, onJumpToUploads]
  );

  return { finish, isUploading };
}
