import { PROFILBILD_SIZE } from '@gruenerator/shared/profilbild';

import type {
  FlatBackground,
  PersonPlacement,
  ProfilbildAssetSrc,
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
