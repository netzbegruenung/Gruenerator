/**
 * User Image Utilities
 * Types and factory functions for user-uploaded images on the canvas
 */

export interface UserImageInstance {
  id: string;
  src: string;
  fileName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  opacity: number;
}

const TARGET_MAX_DIMENSION = 300;

/**
 * Create a new user image instance centered on the canvas.
 * Loads the image to determine natural dimensions and scales appropriately.
 */
export function createUserImageInstance(
  file: File,
  objectUrl: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<UserImageInstance> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      const maxDim = Math.max(naturalW, naturalH);
      const scaleFactor = maxDim > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / maxDim : 1;
      const width = naturalW * scaleFactor;
      const height = naturalH * scaleFactor;

      resolve({
        id: `user-image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        src: objectUrl,
        fileName: file.name,
        x: canvasWidth / 2 - width / 2,
        y: canvasHeight / 2 - height / 2,
        width,
        height,
        rotation: 0,
        scale: 1,
        opacity: 1,
      });
    };
    img.onerror = () => {
      resolve({
        id: `user-image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        src: objectUrl,
        fileName: file.name,
        x: canvasWidth / 2 - 150,
        y: canvasHeight / 2 - 100,
        width: 300,
        height: 200,
        rotation: 0,
        scale: 1,
        opacity: 1,
      });
    };
    img.src = objectUrl;
  });
}
