/**
 * useImageCoverFit - Calculate image dimensions for cover-fit display
 * Computes dimensions to cover a container while maintaining aspect ratio
 */

import { useMemo } from 'react';

export interface CoverFitDimensions {
  displayWidth: number;
  displayHeight: number;
}

/**
 * Calculates image dimensions to cover a container (CSS object-fit: cover behavior)
 * @param image - The loaded image element (from useImage hook)
 * @param containerWidth - Width of the container to fill
 * @param containerHeight - Height of the container to fill
 * @param scale - Optional scale multiplier (default: 1)
 * @returns Dimensions to display the image, or null if no image
 */
export function useImageCoverFit(
  image: HTMLImageElement | undefined,
  containerWidth: number,
  containerHeight: number,
  scale = 1
): CoverFitDimensions | null {
  return useMemo(() => {
    if (!image) return null;

    const imgAspect = image.width / image.height;
    const containerAspect = containerWidth / containerHeight;

    let displayWidth: number;
    let displayHeight: number;

    if (imgAspect > containerAspect) {
      // Image is wider than container - fit by height
      displayHeight = containerHeight * scale;
      displayWidth = displayHeight * imgAspect;
    } else {
      // Image is taller than container - fit by width
      displayWidth = containerWidth * scale;
      displayHeight = displayWidth / imgAspect;
    }

    return { displayWidth, displayHeight };
  }, [image, containerWidth, containerHeight, scale]);
}
