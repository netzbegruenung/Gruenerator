/**
 * Canvas Assets Registry
 * Centralized registry of all available decorative assets for canvas editor
 */

export interface UniversalAsset {
  id: string;
  src: string;
  label: string;
  category: 'decoration' | 'mark';
  tags: string[];
}

/**
 * Runtime instance of an asset placed on the canvas
 * Follows the same pattern as ShapeInstance and IllustrationInstance
 */
export interface AssetInstance {
  id: string;
  assetId: string; // Reference to UniversalAsset.id
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
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
 * System Assets Configuration
 * DRY: Single source of truth for all hardcoded asset paths used in layouts
 */
export const SYSTEM_ASSETS = {
  sunflower: {
    yellow: {
      src: '/Sonnenblume.png',
      label: 'Sonnenblume (Gelb)',
    },
    green: {
      src: '/sonnenblume_dunkelgruen.svg',
      label: 'Sonnenblume (Grün)',
    },
    // Light-green flower matching the Info sharepic's server render
    // (apps/api/public/sonnenblume_gruen.png).
    greenLight: {
      src: '/sonnenblume_gruen.png',
      label: 'Sonnenblume (Hellgrün)',
    },
  },
  quote: {
    white: {
      src: '/quote-white.svg',
      label: 'Anführungszeichen (Weiß)',
    },
    default: {
      src: '/quote.svg',
      label: 'Anführungszeichen',
    },
  },
  // Österreich (de-AT) — reduziertes Ein-Balken-Logo "G DIE GRÜNEN" (CI 2026)
  logoAt: {
    weiss: {
      src: '/gruene-at-logo-weiss.png',
      label: 'Die Grünen (weiß)',
    },
    gruen: {
      src: '/gruene-at-logo-gruen.png',
      label: 'Die Grünen (grün)',
    },
  },
  arrow: {
    src: '/arrow_right.svg',
    label: 'Pfeil rechts',
  },
  backgrounds: {
    info: {
      tanne: '/Info_bg_tanne.png',
      sand: '/Info_bg_sand.png',
    },
  },
} as const;

/**
 * @deprecated Use SYSTEM_ASSETS.sunflower instead
 */
export const SYSTEM_SUNFLOWER = SYSTEM_ASSETS.sunflower;

/**
 * All available decorative assets that can be used across canvas types
 */
export const ALL_ASSETS: UniversalAsset[] = [
  {
    id: 'sunflower',
    src: SYSTEM_ASSETS.sunflower.yellow.src,
    label: SYSTEM_ASSETS.sunflower.yellow.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'gelb', 'yellow', 'natur', 'pflanze', 'sommer'],
  },
  {
    id: 'sunflower-green',
    src: SYSTEM_ASSETS.sunflower.green.src,
    label: SYSTEM_ASSETS.sunflower.green.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'grün', 'green', 'natur', 'pflanze'],
  },
  {
    id: 'gruene-at-logo-weiss',
    src: SYSTEM_ASSETS.logoAt.weiss.src,
    label: SYSTEM_ASSETS.logoAt.weiss.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'weiß', 'weiss', 'marke'],
  },
  {
    id: 'gruene-at-logo-gruen',
    src: SYSTEM_ASSETS.logoAt.gruen.src,
    label: SYSTEM_ASSETS.logoAt.gruen.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'grün', 'gruen', 'marke'],
  },
  {
    id: 'quote-mark',
    src: SYSTEM_ASSETS.quote.default.src,
    label: SYSTEM_ASSETS.quote.default.label,
    category: 'mark',
    tags: ['zitat', 'quote', 'text', 'spruch', 'rede'],
  },
  {
    id: 'arrow',
    src: SYSTEM_ASSETS.arrow.src,
    label: SYSTEM_ASSETS.arrow.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'richtung', 'zeiger', 'hinweis'],
  },
];

/**
 * Logo assets shown in the "Logos" (grafiken) category.
 * Only true logos (decoration) — marks like Anführungszeichen/Pfeil are excluded.
 */
export const LOGO_ASSETS: UniversalAsset[] = ALL_ASSETS.filter((a) => a.category === 'decoration');

/** Logos ordered recommended-first — shared by the browse strip and the Logos drill-down. */
export function sortLogoAssets(recommendedAssetIds: readonly string[]): UniversalAsset[] {
  const recommended = LOGO_ASSETS.filter((a) => recommendedAssetIds.includes(a.id));
  const others = LOGO_ASSETS.filter((a) => !recommendedAssetIds.includes(a.id));
  return [...recommended, ...others];
}

/**
 * Mapping of canvas types to their recommended (default) assets
 * These appear in the "Empfohlen" section at the top
 */
export const CANVAS_RECOMMENDED_ASSETS: Record<string, string[]> = {
  zitat: ['quote-mark'],
  'zitat-pure': ['sunflower-green', 'quote-mark'],
  simple: [],
  info: ['arrow'],
  dreizeilen: ['sunflower'],
  veranstaltung: [],
};

/**
 * Get asset by ID
 */
export function getAssetById(id: string): UniversalAsset | undefined {
  return ALL_ASSETS.find((asset) => asset.id === id);
}

/**
 * Get recommended assets for a canvas type
 */
export function getRecommendedAssets(canvasType: string): UniversalAsset[] {
  const recommendedIds = CANVAS_RECOMMENDED_ASSETS[canvasType] || [];
  return recommendedIds
    .map((id) => getAssetById(id))
    .filter((asset): asset is UniversalAsset => asset !== undefined);
}

/**
 * Get non-recommended assets for a canvas type
 */
export function getOtherAssets(canvasType: string): UniversalAsset[] {
  const recommendedIds = CANVAS_RECOMMENDED_ASSETS[canvasType] || [];
  return ALL_ASSETS.filter((asset) => !recommendedIds.includes(asset.id));
}
