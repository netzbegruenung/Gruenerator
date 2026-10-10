import {
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  defaultPlacement,
  gradientLine,
  PROFILBILD_SIZE,
  STICKER_BASE_WIDTH,
} from '@gruenerator/shared/profilbild';

import type {
  FlatBackground,
  PersonPlacement,
  ProfilbildAssetSrc,
  ProfilbildSticker,
  Sized,
} from '@gruenerator/shared/profilbild';
import type { SkImage } from '@shopify/react-native-skia';

export type MobileBackground =
  FlatBackground | { kind: 'image'; image: SkImage } | { kind: 'preset'; designId: string };

export interface SceneSticker {
  uid: string;
  src: ProfilbildAssetSrc;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ProfilbildModel {
  background: MobileBackground;
  person: PersonPlacement;
  stickers: SceneSticker[];
}

export function stripeRects(colors: string[], size = PROFILBILD_SIZE) {
  const band = Math.floor(size / colors.length);
  return colors.map((color, i) => ({
    y: i * band,
    height: i === colors.length - 1 ? size - band * i : band,
    color,
  }));
}

export function sceneScale(viewSize: number): number {
  return viewSize / PROFILBILD_SIZE;
}

export function initialModel(person: Sized, isAustria: boolean): ProfilbildModel {
  const swatches = isAustria ? COLOR_SWATCHES_AT : COLOR_SWATCHES_DE;
  return { background: swatches[0].background, person: defaultPlacement(person), stickers: [] };
}

export function newSticker(sticker: ProfilbildSticker, image: Sized, uid: string): SceneSticker {
  const width = STICKER_BASE_WIDTH * PROFILBILD_SIZE * sticker.defaultScale;
  return {
    uid,
    src: sticker.src,
    x: PROFILBILD_SIZE / 2,
    y: PROFILBILD_SIZE / 2,
    width,
    height: (width * image.height) / image.width,
    rotation: 0,
  };
}

type Stops<T> = readonly [T, T, ...T[]];

interface SwatchGradient {
  colors: Stops<string>;
  locations: Stops<number> | null;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** expo-linear-gradient props for a swatch: unit start/end, hard stops for stripes. */
export function swatchGradient(bg: Exclude<FlatBackground, { kind: 'color' }>): SwatchGradient {
  if (bg.kind === 'stripes') {
    const n = bg.colors.length;
    return {
      colors: bg.colors.flatMap((c) => [c, c]) as unknown as Stops<string>,
      locations: bg.colors.flatMap((_, i) => [i / n, (i + 1) / n]) as unknown as Stops<number>,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
    };
  }
  const [x0, y0, x1, y1] = gradientLine(bg.angle, 1);
  return {
    colors: bg.stops as unknown as Stops<string>,
    locations: null,
    start: { x: x0, y: y0 },
    end: { x: x1, y: y1 },
  };
}
