// SPDX-License-Identifier: MPL-2.0
/**
 * Canvas assets: placed graphics and the catalogue they resolve against.
 * The graphics themselves are host data (`registerAssetCatalog`); the editor
 * knows none of them by name.
 */

import type { KawaiiDef, SvgDef } from '@ggraphic/editor/utils/illustrations/types';
import type { StickerRef } from '@ggraphic/schema';

export type AssetAudience = 'de-DE' | 'de-AT' | 'all';

export interface UniversalAsset {
  id: string;
  src: string;
  label: string;
  category: 'decoration' | 'mark' | 'emoji' | 'sticker';
  tags: string[];
  /** Which brand locale the asset belongs to; 'all' is locale-independent. */
  audience: AssetAudience;
  /** Light artwork that needs a dark tile in the catalogue to stay visible. */
  darkPreview?: boolean;
}

/**
 * Assets werden auf eine einheitliche Kantenlaenge normalisiert: `AssetPrimitive`
 * rechnet die natuerliche Bildgroesse so um, dass die LAENGERE Seite bei
 * `scale: 1` genau so viele Pixel misst. Wer aus einer Vorlagen-Grafik mit
 * fester Breite/Hoehe eine Instanz macht, rechnet gegen dieselbe Zahl zurueck —
 * darum steht sie hier und nicht im Primitiv.
 */
export const ASSET_TARGET_SIZE = 150;

/**
 * Runtime instance of an asset placed on the canvas
 * Follows the same pattern as ShapeInstance and IllustrationInstance
 */
export interface AssetInstance {
  id: string;
  assetId: string; // Reference to UniversalAsset.id, or `asset:<uuid>` for a shop sticker
  /** Own image of a shop sticker: a share path the host's `isInstanceSrc` accepts. */
  src?: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * Factory function to create a new asset instance centered on the canvas
 */
export const createAssetInstance = (
  assetId: string,
  canvasWidth: number,
  canvasHeight: number
): AssetInstance => ({
  id: `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  assetId,
  x: canvasWidth / 2,
  y: canvasHeight / 2,
  scale: 1,
  rotation: 0,
  opacity: 1,
});

/**
 * A sticker on the canvas: a catalogue sticker by id, a shop sticker with its
 * share path. Null when the ref resolves to no image.
 */
export const createStickerInstance = (
  ref: StickerRef,
  canvasWidth: number,
  canvasHeight: number,
  catalog: CanvasAssetCatalog = registered
): AssetInstance | null => {
  const base = createAssetInstance(ref.id, canvasWidth, canvasHeight);
  const instance = catalog.isInstanceSrc(ref.src) ? { ...base, src: ref.src } : base;
  return resolveAssetInstanceSrc(instance, catalog) ? instance : null;
};

/** Any emoji by its file code ("1f600", "1f9d1_1f3fb"). */
export const emojiCodeAssetId = (code: string): string => `emoji-${code}`;

const EMOJI_ID = /^emoji-([0-9a-f]{4,6}(?:_[0-9a-f]{4,6})*)$/;

/**
 * The full catalogue (`utils/emoji/emojiCatalog`) loads lazily, but a placed
 * emoji must draw without it: its id alone names the file, through the host's
 * `emojiSrc`. The pattern keeps persisted state from naming anything but an
 * emoji code.
 */
function emojiAssetFromId(id: string, catalog: CanvasAssetCatalog): UniversalAsset | undefined {
  const code = EMOJI_ID.exec(id)?.[1];
  if (!code || !catalog.emojiSrc) return undefined;
  return {
    id,
    src: catalog.emojiSrc(code),
    label: String.fromCodePoint(...code.split('_').map((cp) => parseInt(cp, 16))),
    category: 'emoji',
    tags: ['emoji'],
    audience: 'all',
  };
}

/**
 * The graphics a placed asset instance can name, supplied by the host
 * (`registerAssetCatalog`). Saved canvases reference them by id and src, so
 * a host never renames an entry.
 */
export interface CanvasAssetCatalog {
  /** Everything an instance may name, in lookup order: by id and by src, the first match wins. */
  assets: readonly UniversalAsset[];
  /**
   * Is this an image the host stores for one instance (a shop sticker)? Such
   * an instance draws from its own `src`; any other `src` is ignored.
   */
  isInstanceSrc: (src: string) => boolean;
  /**
   * Where the file of an emoji lives, by its code ("1f600", "1f9d1_1f3fb").
   * Without it the editor knows no emoji file and a placed emoji draws nothing.
   */
  emojiSrc?: (code: string) => string;
  /** The illustration catalogues; without them the editor offers none. */
  illustrations?: IllustrationSources;
}

/** The illustration sets a host offers, loaded on the first lookup. */
export interface IllustrationSources {
  loadKawaii: () => Promise<KawaiiDef[]>;
  /** Every SVG set, in catalogue order. */
  loadSvg: () => Promise<SvgDef[]>;
  /** Where the SVG files and their `thumbs/` PNGs live, before `<source>/<filename>`. */
  basePath: string;
}

/**
 * A module-level registry, not a `CanvasEditorServices` field: the lookups run
 * in commands, action factories and offscreen renders that have no React
 * context. Without a host the editor knows no catalogue graphic, no emoji
 * file and no illustration, and ignores every instance `src`.
 */
let registered: CanvasAssetCatalog = { assets: [], isInstanceSrc: () => false };

/** The host's catalogue, installed once at startup; replaces the one before. */
export function registerAssetCatalog(catalog: CanvasAssetCatalog): void {
  registered = catalog;
}

/** The catalogue lookups answer from (`utils/illustrations/registry`). */
export function registeredAssetCatalog(): CanvasAssetCatalog {
  return registered;
}

export function hasDarkPreview(asset: UniversalAsset): boolean {
  return asset.darkPreview === true || /weiss|white/.test(asset.id);
}

export function assetMatchesLocale(asset: UniversalAsset, locale: AssetAudience): boolean {
  return asset.audience === 'all' || asset.audience === locale;
}

/**
 * Get asset by ID — aus dem Katalog des Hosts, dazu jedes Emoji, denn alle koennen als
 * Asset-Instanz auf der Flaeche liegen.
 */
export function getAssetById(
  id: string,
  catalog: CanvasAssetCatalog = registered
): UniversalAsset | undefined {
  return catalog.assets.find((asset) => asset.id === id) ?? emojiAssetFromId(id, catalog);
}

/**
 * The image an instance draws: its own share path (shop sticker), else the
 * catalogue's. A foreign `src` is ignored so persisted state can't point the
 * canvas at an arbitrary URL.
 */
export function resolveAssetInstanceSrc(
  instance: Pick<AssetInstance, 'assetId' | 'src'>,
  catalog: CanvasAssetCatalog = registered
): string | null {
  if (instance.src && catalog.isInstanceSrc(instance.src)) return instance.src;
  return getAssetById(instance.assetId, catalog)?.src ?? null;
}

/** Sticker-like instances get a pixel-exact hit area: transparent pixels click through. */
export function isStickerLikeInstance(
  instance: Pick<AssetInstance, 'assetId' | 'src'>,
  catalog: CanvasAssetCatalog = registered
): boolean {
  if (instance.src && catalog.isInstanceSrc(instance.src)) return true;
  return getAssetById(instance.assetId, catalog)?.category === 'sticker';
}

/**
 * Welche Grafik steckt hinter dieser Quelle? Die Bruecke von einer Vorlage, die
 * ihre Bilder als `src` deklariert, zum Katalog, der sie ueber eine ID fuehrt —
 * die Vorlagen-Elemente und die Katalog-Eintraege sind dieselben Bilder, nur
 * zweimal aufgeschrieben (#3403).
 */
export function getAssetBySrc(
  src: string,
  catalog: CanvasAssetCatalog = registered
): UniversalAsset | undefined {
  return catalog.assets.find((asset) => asset.src === src);
}
