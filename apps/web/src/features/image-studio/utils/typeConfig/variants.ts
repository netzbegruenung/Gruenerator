/**
 * Variant System for Image Studio
 * Consolidated variant definitions - single source of truth for UI
 */
import type { VariantStyle, VariantTypeConfig, Variant } from './types';

/**
 * Base variant styles for PURE_CREATE
 * Adding a new style here automatically makes it available to all variant types
 */
export const VARIANT_STYLES: Record<string, VariantStyle> = {
  illustration: {
    label: 'Illustration',
    imageName: 'soft-illustration.png',
    description: 'Erstelle eine weiche, künstlerische Darstellung',
  },
  realistic: {
    label: 'Realistisch',
    imageName: 'realistic-photo.png',
    description: 'Erstelle ein fotorealistisches Bild',
  },
  pixel: {
    label: 'Pixel Art',
    imageName: 'pixel-art.png',
    description: 'Erstelle ein Bild im Retro-Pixelstil',
  },
};

/**
 * Variant type configurations
 * Maps style keys to API-expected values and image paths
 */
export const VARIANT_TYPES: Record<string, VariantTypeConfig> = {
  pure: {
    basePath: '/imagine-assets/variants-pure',
    valueMap: {
      illustration: 'illustration-pure',
      realistic: 'realistic-pure',
      pixel: 'pixel-pure',
    },
  },
  sharepic: {
    basePath: '/imagine-assets/variants',
    valueMap: {
      illustration: 'light-top',
      realistic: 'realistic-top',
      pixel: 'pixel-top',
    },
  },
};

/**
 * Creates variant array for a specific type
 * @param variantType - 'pure' or 'sharepic'
 * @returns Variant objects ready for TYPE_CONFIG
 */
export const createVariants = (variantType: 'pure' | 'sharepic'): Variant[] => {
  const typeConfig = VARIANT_TYPES[variantType];
  if (!typeConfig) return [];

  return Object.entries(VARIANT_STYLES).map(([styleKey, { label, imageName, description }]) => ({
    value: typeConfig.valueMap[styleKey],
    label,
    description,
    imageUrl: `${typeConfig.basePath}/${imageName}`,
  }));
};
