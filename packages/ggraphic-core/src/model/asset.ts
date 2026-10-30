// SPDX-License-Identifier: MPL-2.0
/**
 * Grafiken (Sticker, Logos) auf der Seite.
 */

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
