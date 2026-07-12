import { useCallback } from 'react';

import { useImagePlacement } from '../../useImagePlacement';

import type { ToolPanelSuccess } from './ToolPanel';

interface Options {
  /** When present, the generated image is placed straight onto the canvas. */
  onPlaceImageUrl?: (url: string, fileName: string) => void;
  /** Fallback nudge to the Uploads tab when direct placement isn't wired. */
  onJumpToUploads?: () => void;
}

/**
 * Shared finish-step for the generator tools, built on {@link useImagePlacement}.
 * When `onPlaceImageUrl` is wired, the produced file is uploaded with the
 * `canvas-element` source — a durable share URL excluded from the Uploads tab
 * and Mediathek — and placed straight onto the canvas. Otherwise it falls back
 * to adding the file to Uploads. Returns the `ToolPanelSuccess` to display.
 */
export function useToolImagePlacement({ onPlaceImageUrl, onJumpToUploads }: Options) {
  const { place, isUploading } = useImagePlacement(onPlaceImageUrl);

  const finish = useCallback(
    async (file: File): Promise<ToolPanelSuccess> => {
      if (onPlaceImageUrl) {
        const { name } = await place(file, 'canvas-element');
        return { thumbnailUrl: URL.createObjectURL(file), itemName: name, placedOnCanvas: true };
      }

      // Fallback (no canvas placement wired): add to the Uploads library.
      const { name } = await place(file, 'upload');
      return { thumbnailUrl: URL.createObjectURL(file), itemName: name, onJumpToUploads };
    },
    [place, onPlaceImageUrl, onJumpToUploads]
  );

  return { finish, isUploading };
}
