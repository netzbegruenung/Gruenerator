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
  /** Duotone: shadows to a dark shade of this colour, highlights to a pale one. */
  tint?: string;
  /** How far the tint replaces the photo's own colours: 0..1. */
  tintStrength?: number;
  /** `cover`: the source is cropped (Konva `crop`) to fill width × height, centred. */
  fit?: 'cover';
  /** `kreis`: clipped to the circle inside width × height. */
  mask?: 'kreis';
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
  | 'tint'
  | 'tintStrength'
>;

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The centred part of a `natural` source that fills a `frame` without distortion (Konva `crop`). */
export function coverCrop(
  natural: { width: number; height: number },
  frame: { width: number; height: number }
): ImageCrop {
  const scale = Math.max(frame.width / natural.width, frame.height / natural.height);
  const width = frame.width / scale;
  const height = frame.height / scale;
  return { x: (natural.width - width) / 2, y: (natural.height - height) / 2, width, height };
}

export interface CropPreset {
  id: 'original' | 'quadrat' | 'kreis' | 'streifen';
  label: string;
  /** Width : height of the frame; absent: the source's own. */
  ratio?: number;
  mask?: UserImageInstance['mask'];
}

export const CROP_PRESETS: readonly CropPreset[] = [
  { id: 'original', label: 'Original' },
  { id: 'quadrat', label: 'Quadrat', ratio: 1 },
  { id: 'kreis', label: 'Kreis', ratio: 1, mask: 'kreis' },
  { id: 'streifen', label: 'Streifen', ratio: 3 },
];

/** The frame a crop preset gives the image: same width, same centre, the preset's shape. */
export function cropPresetUpdate(
  img: Pick<UserImageInstance, 'y' | 'width' | 'height'>,
  preset: CropPreset,
  natural: { width: number; height: number }
): Partial<UserImageInstance> {
  const height = img.width / (preset.ratio ?? natural.width / natural.height);
  return {
    y: img.y + (img.height - height) / 2,
    height,
    fit: preset.ratio ? 'cover' : undefined,
    mask: preset.mask,
  };
}

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

/** Longest-edge cap for uploaded rasters — plenty for sharepic export sizes. */
const UPLOAD_MAX_DIMENSION = 2560;
const UPLOAD_WEBP_QUALITY = 0.9;

/**
 * Downscale large raster images before upload. Phone photos (4000px, several MB)
 * otherwise stall both the upload and the durable re-fetch, even though the
 * canvas only ever displays them at a few hundred px. Skips small images, SVGs
 * and GIFs (animation); encodes WebP (keeps alpha) at high quality. Returns the
 * original file unchanged on any failure.
 */
export async function downscaleImageForUpload(file: File): Promise<File> {
  if (
    !file.type.startsWith('image/') ||
    file.type === 'image/svg+xml' ||
    file.type === 'image/gif'
  ) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const maxDim = Math.max(bitmap.width, bitmap.height);
    if (maxDim <= UPLOAD_MAX_DIMENSION) {
      bitmap.close();
      return file;
    }

    const scale = UPLOAD_MAX_DIMENSION / maxDim;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', UPLOAD_WEBP_QUALITY)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([blob], name, { type: 'image/webp' });
  } catch {
    return file;
  }
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
