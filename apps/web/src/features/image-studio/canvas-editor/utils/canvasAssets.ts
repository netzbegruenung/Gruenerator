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
 * All available decorative assets that can be used across canvas types
 */
export const ALL_ASSETS: UniversalAsset[] = [
    { id: 'sunflower', src: '/Sonnenblume.png', label: 'Sonnenblume', category: 'decoration', tags: ['blume', 'flower', 'gelb', 'yellow', 'natur', 'pflanze', 'sommer'] },
    { id: 'sunflower-green', src: '/sonnenblume_dunkelgruen.svg', label: 'Sonnenblume (Grün)', category: 'decoration', tags: ['blume', 'flower', 'grün', 'green', 'natur', 'pflanze'] },
    { id: 'quote-mark', src: '/quote.svg', label: 'Anführungszeichen', category: 'mark', tags: ['zitat', 'quote', 'text', 'spruch', 'rede'] },
    { id: 'arrow', src: '/arrow_right.svg', label: 'Pfeil', category: 'mark', tags: ['pfeil', 'arrow', 'richtung', 'zeiger', 'hinweis'] },
];

/**
 * Mapping of canvas types to their recommended (default) assets
 * These appear in the "Empfohlen" section at the top
 */
export const CANVAS_RECOMMENDED_ASSETS: Record<string, string[]> = {
    'zitat': ['quote-mark'],
    'zitat-pure': ['sunflower-green', 'quote-mark'],
    'simple': [],
    'info': ['arrow'],
    'dreizeilen': ['sunflower'],
    'veranstaltung': [],
};

/**
 * Get asset by ID
 */
export function getAssetById(id: string): UniversalAsset | undefined {
    return ALL_ASSETS.find(asset => asset.id === id);
}

/**
 * Get recommended assets for a canvas type
 */
export function getRecommendedAssets(canvasType: string): UniversalAsset[] {
    const recommendedIds = CANVAS_RECOMMENDED_ASSETS[canvasType] || [];
    return recommendedIds
        .map(id => getAssetById(id))
        .filter((asset): asset is UniversalAsset => asset !== undefined);
}

/**
 * Get non-recommended assets for a canvas type
 */
export function getOtherAssets(canvasType: string): UniversalAsset[] {
    const recommendedIds = CANVAS_RECOMMENDED_ASSETS[canvasType] || [];
    return ALL_ASSETS.filter(asset => !recommendedIds.includes(asset.id));
}
