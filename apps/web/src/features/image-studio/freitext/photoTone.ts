import { type PhotoTone } from '@gruenerator/canvas-editor/composer';
import { type SharepicSpec, type SharepicTextSide } from '@gruenerator/contracts';

/** Sampling grid: the 1080 × 1350 canvas, cover-cropped and shrunk. */
const SAMPLE_W = 54;
const SAMPLE_H = 68;
/** Share of the picture the text side covers. */
const SIDE_SHARE = { links: 0.6, rechts: 0.6, unten: 0.62, oben: 0.62 } as const;

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Mean and spread of the relative luminance (0–1) over the text side. */
export function sideLuminance(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  side: SharepicTextSide
): { mean: number; stdev: number } {
  const x0 = side === 'rechts' ? Math.floor(width * (1 - SIDE_SHARE.rechts)) : 0;
  const x1 = side === 'links' ? Math.ceil(width * SIDE_SHARE.links) : width;
  const y0 = side === 'unten' ? Math.floor(height * (1 - SIDE_SHARE.unten)) : 0;
  const y1 = side === 'oben' ? Math.ceil(height * SIDE_SHARE.oben) : height;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const l =
        0.2126 * linear(rgba[i]!) + 0.7152 * linear(rgba[i + 1]!) + 0.0722 * linear(rgba[i + 2]!);
      sum += l;
      sumSq += l * l;
      n++;
    }
  }
  if (n === 0) return { mean: 0.5, stdev: 0 };
  const mean = sum / n;
  return { mean, stdev: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) };
}

export function classifyTone(mean: number, stdev: number): PhotoTone {
  if (mean > 0.55 || (mean > 0.4 && stdev > 0.22)) return 'hell';
  if (mean < 0.3 && stdev < 0.18) return 'dunkel';
  return 'mittel';
}

/** `null` = not measured (yet, or the photo failed to load). */
const cache = new Map<string, PhotoTone | null>();
const key = (filename: string, side: SharepicTextSide) => `${filename}|${side}`;

async function measure(src: string, side: SharepicTextSide): Promise<PhotoTone | null> {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !image.naturalWidth) return null;
    // Cover crop, as the canvas places the photo.
    const scale = Math.max(SAMPLE_W / image.naturalWidth, SAMPLE_H / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.drawImage(image, (SAMPLE_W - w) / 2, (SAMPLE_H - h) / 2, w, h);
    const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const { mean, stdev } = sideLuminance(data, SAMPLE_W, SAMPLE_H, side);
    return classifyTone(mean, stdev);
  } catch {
    return null;
  }
}

/** Measures every photo of the spec on its text side; never throws. */
export async function primePhotoTones(
  spec: SharepicSpec,
  photoSrc: (filename: string) => string
): Promise<void> {
  const jobs = new Map<string, Promise<void>>();
  for (const slide of spec.slides) {
    const bg = slide.background;
    if (bg.kind !== 'foto') continue;
    const k = key(bg.filename, bg.textSeite);
    if (cache.has(k) || jobs.has(k)) continue;
    jobs.set(
      k,
      measure(photoSrc(bg.filename), bg.textSeite).then((tone) => {
        cache.set(k, tone);
      })
    );
  }
  await Promise.all(jobs.values());
}

export const cachedPhotoTone = (filename: string, side: SharepicTextSide): PhotoTone | null =>
  cache.get(key(filename, side)) ?? null;
