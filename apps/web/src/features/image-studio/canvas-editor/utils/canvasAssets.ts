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
