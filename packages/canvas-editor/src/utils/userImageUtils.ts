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
  /** Gaussian blur radius in px; omit/0 for no blur. */
  blur?: number;
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  // --- Image adjustments (Konva.Filters); omit/default = no effect ---
  /** Konva Brighten: -1..1 */
  brightness?: number;
  /** Konva Contrast: -100..100 */
  contrast?: number;
  /** Konva HSL saturation: -2..10 */
  saturation?: number;
  /** Konva HSL hue: 0..360 */
  hue?: number;
  /** Color temperature -100..100 (custom warm/cool R/B shift) */
  temperature?: number;
  grayscale?: boolean;
  sepia?: boolean;
  invert?: boolean;
}

/** The adjustment fields, for reset / preset helpers. */
export type ImageAdjustments = Pick<
  UserImageInstance,
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'temperature'
  | 'grayscale'
  | 'sepia'
  | 'invert'
>;

const TARGET_MAX_DIMENSION = 300;
const FALLBACK_WIDTH = 300;
const FALLBACK_HEIGHT = 200;

function makeId(): string {
  return `user-image-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function scaleToTarget(naturalW: number, naturalH: number): { width: number; height: number } {
  const maxDim = Math.max(naturalW, naturalH);
  const scaleFactor = maxDim > TARGET_MAX_DIMENSION ? TARGET_MAX_DIMENSION / maxDim : 1;
  return { width: naturalW * scaleFactor, height: naturalH * scaleFactor };
}

function makeInstance(
  src: string,
  fileName: string,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): UserImageInstance {
  return {
    id: makeId(),
    src,
    fileName,
    x: canvasWidth / 2 - width / 2,
    y: canvasHeight / 2 - height / 2,
    width,
    height,
    rotation: 0,
    scale: 1,
    opacity: 1,
  };
}

export function createUserImageInstance(
  file: File,
  objectUrl: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<UserImageInstance> {
  return createUserImageInstanceFromUrl(objectUrl, file.name, canvasWidth, canvasHeight);
}

export function createUserImageInstanceFromUrl(
  url: string,
  fileName: string,
  canvasWidth: number,
  canvasHeight: number
): Promise<UserImageInstance> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const { width, height } = scaleToTarget(img.naturalWidth, img.naturalHeight);
      resolve(makeInstance(url, fileName, width, height, canvasWidth, canvasHeight));
    };
    img.onerror = () => {
      resolve(
        makeInstance(url, fileName, FALLBACK_WIDTH, FALLBACK_HEIGHT, canvasWidth, canvasHeight)
      );
    };
    img.src = url;
  });
}
