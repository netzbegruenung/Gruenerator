import { type MarketplaceCollectionId } from '../schemas/marketplace.js';
import { SHAREPIC_PHOTO_URL } from '../schemas/sharepicCreator/photos.js';

import { type ProfilbildAssetSrc } from './profilbildAssets.js';

/**
 * System sticker catalogue. All sources are same-origin so the composed canvas
 * stays untainted for the download. A new sticker = one entry here (SVGs need
 * explicit width/height, or Firefox draws nothing). A sticker with `kollektion`
 * is offered only through that Marktplatz collection, not in the pickers.
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
  // Grüne Jugend, in the design of each country's sharepics: only in its collection.
  {
    id: 'gj-zackenstern',
    label: 'Zackenstern „Ich bin dabei!“',
    src: '/studio-tools/stickers/gj-zackenstern.png',
    defaultScale: 1.4,
    audience: 'de-DE',
    kollektion: 'gruene-jugend',
    tags: ['grüne jugend', 'störer', 'stern'],
  },
  {
    id: 'gj-zeilenbalken',
    label: 'Zeilenbalken „Wählen ab 16!“',
    src: '/studio-tools/stickers/gj-zeilenbalken.png',
    defaultScale: 1.4,
    audience: 'de-DE',
    kollektion: 'gruene-jugend',
    tags: ['grüne jugend', 'balken', 'wahlalter'],
  },
  {
    id: 'gj-tape',
    label: 'Tape „Frag mich!“',
    src: '/studio-tools/stickers/gj-tape.png',
    defaultScale: 1.4,
    audience: 'de-DE',
    kollektion: 'gruene-jugend',
    tags: ['grüne jugend', 'handschrift', 'tape'],
  },
  {
    id: 'gj-rahmen',
    label: 'Profilrahmen GRÜNE JUGEND',
    src: '/studio-tools/stickers/gj-rahmen.png',
    defaultScale: 4,
    audience: 'de-DE',
    kollektion: 'gruene-jugend',
    tags: ['grüne jugend', 'rahmen', 'ring'],
  },
  {
    id: 'gj-sprechblase',
    label: 'Sprechblase „Klimagerecht!“',
    src: '/studio-tools/stickers/gj-sprechblase.png',
    defaultScale: 1.4,
    audience: 'de-DE',
    kollektion: 'gruene-jugend',
    tags: ['grüne jugend', 'sprechblase', 'klima'],
  },
  {
    id: 'gj-at-stoerer',
    label: 'Störer „Komm mit!“',
    src: '/studio-tools/stickers/gj-at-stoerer.png',
    defaultScale: 1.4,
    audience: 'de-AT',
    kollektion: 'gruene-jugend-oesterreich',
    tags: ['grüne jugend', 'störer', 'gelb'],
  },
  {
    id: 'gj-at-etikett',
    label: 'Etikett „Sei dabei“',
    src: '/studio-tools/stickers/gj-at-etikett.png',
    defaultScale: 1.4,
    audience: 'de-AT',
    kollektion: 'gruene-jugend-oesterreich',
    tags: ['grüne jugend', 'etikett'],
  },
  {
    id: 'gj-at-rahmen',
    label: 'Profilrahmen Grüne Jugend',
    src: '/studio-tools/stickers/gj-at-rahmen.png',
    defaultScale: 4,
    audience: 'de-AT',
    kollektion: 'gruene-jugend-oesterreich',
    tags: ['grüne jugend', 'rahmen', 'ring'],
  },
  {
    id: 'gj-at-chip',
    label: 'Chip „Heuer!“',
    src: '/studio-tools/stickers/gj-at-chip.png',
    defaultScale: 1.2,
    audience: 'de-AT',
    kollektion: 'gruene-jugend-oesterreich',
    tags: ['grüne jugend', 'chip'],
  },
  {
    id: 'gj-at-sprechblase',
    label: 'Sprechblase „Frag mich!“',
    src: '/studio-tools/stickers/gj-at-sprechblase.png',
    defaultScale: 1.3,
    audience: 'de-AT',
    kollektion: 'gruene-jugend-oesterreich',
    tags: ['grüne jugend', 'sprechblase'],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  src: ProfilbildAssetSrc;
  defaultScale: number;
  audience: 'de-DE' | 'de-AT' | 'all';
  kollektion?: MarketplaceCollectionId;
  tags: readonly string[];
}[];

export type SystemSticker = (typeof SYSTEM_STICKERS)[number];

// Moved to @ggraphic/schema (the editor core places stickers); kept so existing imports resolve.
export type { StickerRef } from '@ggraphic/schema/media/stickerRef';

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
  return SYSTEM_STICKERS.filter(
    (s) => !('kollektion' in s) && (s.audience === 'all' || s.audience === locale)
  );
}

/** The stickers only a collection offers. */
export function stickersForCollection(id: MarketplaceCollectionId): SystemSticker[] {
  return SYSTEM_STICKERS.filter((s) => 'kollektion' in s && s.kollektion === id);
}

export function systemStickerById(id: string): SystemSticker | null {
  return SYSTEM_STICKERS.find((s) => s.id === id) ?? null;
}
