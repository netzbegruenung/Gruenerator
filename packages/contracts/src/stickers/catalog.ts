import { SHAREPIC_PHOTO_URL } from '../schemas/sharepicCreator/photos.js';

import { type ProfilbildAssetSrc } from './profilbildAssets.js';

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
    audience: 'de-DE',
    tags: ['sonnenblume', 'gelb'],
  },
  {
    id: 'sonnenblume-gruen',
    label: 'Sonnenblume grün',
    src: '/sonnenblume_gruen.png',
    defaultScale: 1,
    audience: 'de-DE',
    tags: ['sonnenblume', 'grün'],
  },
  {
    id: 'sonnenblume-weiss',
    label: 'Sonnenblume weiß',
    src: '/sonnenblume_weiss.svg',
    defaultScale: 1,
    audience: 'de-DE',
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
    id: 'progress-pride',
    label: 'Progress-Pride-Flagge',
    src: '/studio-tools/stickers/progress-pride.svg',
    defaultScale: 1.2,
    audience: 'all',
    tags: ['regenbogen', 'pride', 'csd', 'queer', 'flagge', 'vielfalt'],
  },
  {
    id: 'eu-flagge',
    label: 'Europaflagge',
    src: '/studio-tools/stickers/eu-flagge.svg',
    defaultScale: 1.2,
    audience: 'all',
    tags: ['europa', 'eu', 'flagge', 'sterne'],
  },
  {
    id: 'europa-sterne',
    label: 'Europa-Sternenkranz',
    src: '/studio-tools/stickers/europa-sterne.svg',
    defaultScale: 1,
    audience: 'all',
    tags: ['europa', 'eu', 'sterne', 'sternenkranz'],
  },
  {
    id: 'vielfalt',
    label: 'Vielfalt',
    src: '/studio-tools/stickers/vielfalt.svg',
    defaultScale: 1.1,
    audience: 'all',
    tags: ['vielfalt', 'schriftzug'],
  },
  {
    id: 'at-gruen-waehlen',
    label: 'Grün wählen!',
    src: '/studio-tools/stickers/at-gruen-waehlen.png',
    defaultScale: 1,
    audience: 'de-AT',
    tags: ['störer', 'wahl', 'magenta'],
  },
  {
    id: 'at-klima-schuetzen',
    label: 'Klima schützen',
    src: '/studio-tools/stickers/at-klima-schuetzen.png',
    defaultScale: 1.4,
    audience: 'de-AT',
    tags: ['klima', 'schriftzug'],
  },
  {
    id: 'at-jetzt-gruen',
    label: 'Jetzt Grün!',
    src: '/studio-tools/stickers/at-jetzt-gruen.png',
    defaultScale: 1,
    audience: 'de-AT',
    tags: ['störer', 'wahl', 'gelb'],
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

/** A same-origin media-store download path (`/api/share/<token>/download`). */
export function isShareSrc(src: string): boolean {
  return SHAREPIC_PHOTO_URL.test(src);
}

/** The stickers a picker offers in this locale; saved ones parse regardless. */
export function stickersForLocale(locale: 'de-DE' | 'de-AT'): SystemSticker[] {
  return SYSTEM_STICKERS.filter((s) => s.audience === 'all' || s.audience === locale);
}

export function systemStickerById(id: string): SystemSticker | null {
  return SYSTEM_STICKERS.find((s) => s.id === id) ?? null;
}
