import { type StudioAssetSource } from '@gruenerator/contracts';
import {
  ALPHA_THRESHOLD,
  BADGE_PAD,
  STICKER_MAX_SIDE,
  type BadgeGeometry,
} from '@gruenerator/shared/stickers';
import { slugifyName } from '@gruenerator/shared/utils';

export type CreatorStep = 'mode' | 'design' | 'save' | 'done';

export const CREATOR_MODE_ICONS = {
  upload: 'image-outline',
  cutout: 'cut-outline',
  badge: 'text-outline',
} as const satisfies Record<StudioAssetSource, string>;

/** Only the Profilbild can take a new sticker back on the phone. */
export const parseCreatorReturn = (raw: unknown): 'profilbild' | null =>
  raw === 'profilbild' ? raw : null;

export const stickerFilename = (title: string) => `${slugifyName(title, 'sticker')}.png`;

/** Upload mode takes only formats that can carry transparency. */
export function isStickerFile(file: { uri: string; mimeType?: string | null }): boolean {
  if (file.mimeType) return file.mimeType === 'image/png' || file.mimeType === 'image/webp';
  return /\.(png|webp)$/i.test(file.uri.split('?')[0] ?? '');
}

export const OUTLINE_PRESETS = [
  { value: 'duenn', label: 'Dünn', width: 12 },
  { value: 'mittel', label: 'Mittel', width: 24 },
  { value: 'dick', label: 'Dick', width: 40 },
] as const;
export type OutlinePreset = (typeof OUTLINE_PRESETS)[number]['value'];

/**
 * Half-extents of axis-aligned rectangles whose union approximates a disc:
 * Skia's dilate filter only grows by rectangles, so corners are picked along
 * the disc's edge (in whole pixels, as the filter rounds) until every step
 * between two neighbouring corners is at most `maxGap` pixels deep.
 */
export function discRects(radius: number, maxGap = 1): { rx: number; ry: number }[] {
  const r = Math.round(radius);
  if (r <= 0) return [];
  const cornerX = (ry: number) => Math.round(Math.sqrt(r * r - ry * ry));
  const rects = [{ rx: r, ry: 0 }];
  let ry = 0;
  while (ry < r) {
    let next = ry + 1;
    for (let cand = r; cand > ry + 1; cand--) {
      if (r - Math.hypot(cornerX(cand), ry) <= maxGap) {
        next = cand;
        break;
      }
    }
    ry = next;
    rects.push({ rx: cornerX(ry), ry });
  }
  return rects;
}

const hexChannel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;

/**
 * Colour matrix (Skia, unpremultiplied, normalised translation) that paints
 * every pixel in `color` and clears alpha at or below `threshold`, rescaling
 * the rest — the outline's silhouette in one filter.
 */
export function tintThresholdMatrix(color: string, threshold = ALPHA_THRESHOLD): number[] {
  const t = threshold / 255;
  const s = 1 / (1 - t);
  const [r, g, b] = [0, 1, 2].map((c) => hexChannel(color, c));
  // prettier-ignore
  return [
    0, 0, 0, 0, r,
    0, 0, 0, 0, g,
    0, 0, 0, 0, b,
    0, 0, 0, s, -t * s,
  ];
}

/** Badge design size (shape plus outline room) and the factor to a 1024 export. */
export function badgeCanvas(geometry: Pick<BadgeGeometry, 'width' | 'height'>) {
  const width = geometry.width + 2 * BADGE_PAD;
  const height = geometry.height + 2 * BADGE_PAD;
  const scale = STICKER_MAX_SIDE / Math.max(width, height);
  return { width, height, scale };
}

/**
 * Baselines of `count` lines centred in the text box, each line centred in
 * its own `fontSize * lineHeight` slot by the font's ascent (negative) and descent.
 */
export function badgeBaselines(
  count: number,
  box: { y: number; height: number },
  fontSize: number,
  lineHeight: number,
  metrics: { ascent: number; descent: number }
): number[] {
  const slot = fontSize * lineHeight;
  const top = box.y + (box.height - count * slot) / 2;
  return Array.from(
    { length: count },
    (_, i) => top + i * slot + slot / 2 - (metrics.ascent + metrics.descent) / 2
  );
}

/**
 * Colour matrix for the shared `hardenAlpha` curve: keeps the colour and steepens
 * alpha around 50 % by `hardness` (Skia clamps the result).
 */
export function hardenAlphaMatrix(hardness: number): number[] {
  // prettier-ignore
  return [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, hardness, 0.5 - 0.5 * hardness,
  ];
}
