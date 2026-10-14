import { type ProfilbildAssetSrc } from '../profilbild/assets.js';

/**
 * System sticker catalogue. All sources are same-origin so the composed canvas
 * stays untainted for the download. A new sticker = one entry here (SVGs need
 * explicit width/height, or Firefox draws nothing).
 */
export const SYSTEM_STICKERS = [
  {
    id: 'sonnenblume-gelb',
    label: 'Sonnenblume gelb',
    src: '/images/Sonnenblume_RGB_gelb.png',
    defaultScale: 1,
    audience: 'all',
    tags: ['sonnenblume', 'gelb'],
  },
  {
    id: 'sonnenblume-gruen',
    label: 'Sonnenblume grün',
    src: '/sonnenblume_gruen.png',
    defaultScale: 1,
    audience: 'all',
    tags: ['sonnenblume', 'grün'],
  },
  {
    id: 'sonnenblume-weiss',
    label: 'Sonnenblume weiß',
    src: '/sonnenblume_weiss.svg',
    defaultScale: 1,
    audience: 'all',
    tags: ['sonnenblume', 'weiß'],
  },
  {
    id: 'teamgruen',
    label: '#teamgrün',
    src: '/studio-tools/stickers/teamgruen.svg',
    defaultScale: 1.6,
    audience: 'all',
    tags: ['teamgrün', 'hashtag', 'schriftzug'],
  },
  {
    id: 'regenbogen',
    label: 'Regenbogen',
    src: '/studio-tools/stickers/regenbogen.svg',
    defaultScale: 1.3,
    audience: 'all',
    tags: ['regenbogen', 'vielfalt'],
  },
  {
    id: 'regenbogen-herz',
    label: 'Regenbogen-Herz',
    src: '/studio-tools/stickers/regenbogen-herz.svg',
    defaultScale: 1,
    audience: 'all',
    tags: ['regenbogen', 'herz', 'vielfalt'],
  },
  {
    id: 'vielfalt',
    label: 'Vielfalt',
    src: '/studio-tools/stickers/vielfalt.svg',
    defaultScale: 1.1,
    audience: 'all',
    tags: ['vielfalt', 'schriftzug'],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  src: ProfilbildAssetSrc;
  defaultScale: number;
  audience: 'de-DE' | 'de-AT' | 'all';
  tags: readonly string[];
}[];

export type SystemSticker = (typeof SYSTEM_STICKERS)[number];

/** A placed or saved sticker: the catalog id and src, or `asset:<uuid>` and a share path. */
export interface StickerRef {
  id: string;
  src: string;
}

export type AssetStickerId = `asset:${string}`;

/** Share of the canvas width a sticker with defaultScale 1 starts at. */
export const STICKER_BASE_WIDTH = 0.25;

/** Smallest sticker edge in canvas pixels, for handles and keyboard alike. */
export const MIN_STICKER = 40;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assetStickerId(uuid: string): AssetStickerId {
  return `asset:${uuid}`;
}

export function isAssetStickerId(id: string): id is AssetStickerId {
  return id.startsWith('asset:') && UUID_RE.test(id.slice('asset:'.length));
}

export function isShareSrc(src: string): boolean {
  return src.startsWith('/api/share/');
}

export function systemStickerById(id: string): SystemSticker | null {
  return SYSTEM_STICKERS.find((s) => s.id === id) ?? null;
}
