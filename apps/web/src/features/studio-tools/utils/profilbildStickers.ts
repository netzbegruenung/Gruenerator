import { type ProfilbildStickerPlacement } from './composeProfilbild';

/**
 * Sticker catalogue for the Profilbild editor. All sources are same-origin so
 * the composed canvas stays untainted for the download. A new sticker = one
 * entry here (SVGs need explicit width/height, or Firefox draws nothing).
 */
export const PROFILBILD_STICKERS = [
  {
    id: 'sonnenblume-gelb',
    label: 'Sonnenblume gelb',
    src: '/images/Sonnenblume_RGB_gelb.png',
    defaultScale: 1,
  },
  {
    id: 'sonnenblume-gruen',
    label: 'Sonnenblume grün',
    src: '/sonnenblume_gruen.png',
    defaultScale: 1,
  },
  {
    id: 'sonnenblume-weiss',
    label: 'Sonnenblume weiß',
    src: '/sonnenblume_weiss.svg',
    defaultScale: 1,
  },
  {
    id: 'teamgruen',
    label: '#teamgrün',
    src: '/studio-tools/stickers/teamgruen.svg',
    defaultScale: 1.6,
  },
  {
    id: 'regenbogen',
    label: 'Regenbogen',
    src: '/studio-tools/stickers/regenbogen.svg',
    defaultScale: 1.3,
  },
  {
    id: 'regenbogen-herz',
    label: 'Regenbogen-Herz',
    src: '/studio-tools/stickers/regenbogen-herz.svg',
    defaultScale: 1,
  },
  {
    id: 'vielfalt',
    label: 'Vielfalt',
    src: '/studio-tools/stickers/vielfalt.svg',
    defaultScale: 1.1,
  },
] as const;

export type ProfilbildStickerId = (typeof PROFILBILD_STICKERS)[number]['id'];
export type ProfilbildSticker = (typeof PROFILBILD_STICKERS)[number];

/** Share of the canvas width a sticker with defaultScale 1 starts at. */
export const STICKER_BASE_WIDTH = 0.25;

export interface PlacedSticker extends ProfilbildStickerPlacement {
  uid: string;
}

export type StickerChange = Pick<PlacedSticker, 'x' | 'y' | 'width' | 'height' | 'rotation'>;
