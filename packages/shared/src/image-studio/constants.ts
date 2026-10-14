/**
 * Image Studio Constants
 * Platform-agnostic configuration for image-studio types
 */

import { type ImageFormatId } from '@gruenerator/contracts';

import type {
  ImageStudioKiType,
  KiTypeConfig,
  KiStyleVariant,
  GreenEditInfrastructure,
} from './types.js';

// ============================================================================
// KI TYPE CONFIGURATIONS
// ============================================================================

/**
 * Configuration for KI types (FLUX API-based)
 */
export const KI_TYPE_CONFIGS: Record<ImageStudioKiType, KiTypeConfig> = {
  'pure-create': {
    id: 'pure-create',
    label: 'Bild erstellen',
    description: 'Generiere ein Bild aus deiner Beschreibung',
    category: 'ki',
    subcategory: 'create',
    requiresImage: false,
    endpoint: '/imagine/pure',
    minInstructionLength: 5,
    isRateLimited: true,
  },

  'green-edit': {
    id: 'green-edit',
    label: 'Grün verwandeln',
    description: 'Verwandle Straßen in grüne, nachhaltige Räume',
    category: 'ki',
    subcategory: 'edit',
    requiresImage: true,
    endpoint: '/flux/green-edit/prompt',
    minInstructionLength: 15,
    isRateLimited: true,
  },

  'universal-edit': {
    id: 'universal-edit',
    label: 'Bild bearbeiten',
    description: 'Bearbeite ein Bild mit KI nach deinen Anweisungen',
    category: 'ki',
    subcategory: 'edit',
    requiresImage: true,
    endpoint: '/flux/green-edit/prompt',
    minInstructionLength: 15,
    isRateLimited: true,
  },
};

// ============================================================================
// KI STYLE VARIANTS
// ============================================================================

/**
 * Style variant configuration for pure-create
 */
export interface StyleVariantConfig {
  id: KiStyleVariant;
  label: string;
  description: string;
}

/**
 * Available style variants for pure-create
 */
export const STYLE_VARIANTS: StyleVariantConfig[] = [
  {
    id: 'realistic-pure',
    label: 'Realistisch',
    description: 'Fotorealistischer Stil',
  },
  {
    id: 'illustration-pure',
    label: 'Illustration',
    description: 'Weicher, künstlerischer Stil',
  },
  {
    id: 'pixel-pure',
    label: 'Pixel Art',
    description: 'Retro-Spielstil',
  },
  {
    id: 'editorial-pure',
    label: 'Editorial',
    description: 'Magazin-Stil',
  },
];

/**
 * Default style variant. Not the watercolor illustration: it turned every
 * subject into soft woodland kitsch — only on request.
 */
export const DEFAULT_STYLE_VARIANT: KiStyleVariant = 'realistic-pure';

// ============================================================================
// IMAGE FORMATS
// ============================================================================

/**
 * Output formats offered in the Bild-Editor — both for a freshly created image
 * (sent to `/imagine/pure` as explicit dimensions) and as the target of the
 * „Vergrößern" outpaint (sent to `/imagine/outpaint` as the preset id).
 *
 * Every entry is an exact ratio whose sides are multiples of 16 and whose area
 * stays under FLUX's 4 MP cap — the two limits `/imagine/pure` enforces.
 */
export const IMAGE_FORMATS = [
  { id: '4:5', width: 1088, height: 1360 },
  { id: '1:1', width: 1216, height: 1216 },
  { id: '4:3', width: 1408, height: 1056 },
  { id: '3:4', width: 1056, height: 1408 },
  { id: '16:9', width: 1792, height: 1008 },
  { id: '9:16', width: 1008, height: 1792 },
] as const satisfies ReadonlyArray<{ id: ImageFormatId; width: number; height: number }>;

export { type ImageFormatId };

export const IMAGE_FORMAT_IDS: ImageFormatId[] = IMAGE_FORMATS.map((f) => f.id);

/** Matches the dimensions every pure-create variant used before formats existed. */
export const DEFAULT_IMAGE_FORMAT: ImageFormatId = '4:5';

export function getImageFormat(id: ImageFormatId): { width: number; height: number } {
  const found = IMAGE_FORMATS.find((f) => f.id === id);
  return found ?? IMAGE_FORMATS[0];
}

// ============================================================================
// GREEN-EDIT INFRASTRUCTURE OPTIONS
// ============================================================================

/**
 * Infrastructure option configuration
 */
export interface InfrastructureOptionConfig {
  id: GreenEditInfrastructure;
  label: string;
  description: string;
}

/**
 * Available infrastructure options for green-edit
 */
export const INFRASTRUCTURE_OPTIONS: InfrastructureOptionConfig[] = [
  {
    id: 'trees',
    label: 'Bäume & Straßengrün',
    description: 'Schattenspendende Bäume und Grünflächen',
  },
  {
    id: 'flowers',
    label: 'Bepflanzung & Blumen',
    description: 'Bienenfreundliche Blühpflanzen',
  },
  {
    id: 'bike-lanes',
    label: 'Geschützte Fahrradwege',
    description: 'Sichere Radinfrastruktur',
  },
  {
    id: 'benches',
    label: 'Sitzbänke im Schatten',
    description: 'Ruheplätze zum Verweilen',
  },
  {
    id: 'sidewalks',
    label: 'Breitere Gehwege',
    description: 'Mehr Platz für Fußgänger',
  },
  {
    id: 'tram',
    label: 'Straßenbahn',
    description: 'Öffentlicher Nahverkehr auf Schienen',
  },
  {
    id: 'bus-stop',
    label: 'Bushaltestelle',
    description: 'Moderne ÖPNV-Haltestelle',
  },
];

// ============================================================================
// KI HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a type is a KI type
 */
export function isKiType(typeId: string): typeId is ImageStudioKiType {
  return typeId in KI_TYPE_CONFIGS;
}

/**
 * Get KI type configuration
 */
export function getKiTypeConfig(typeId: ImageStudioKiType): KiTypeConfig | null {
  return KI_TYPE_CONFIGS[typeId] || null;
}

/**
 * Get all KI types as array
 */
export function getAllKiTypes(): KiTypeConfig[] {
  return Object.values(KI_TYPE_CONFIGS);
}

/**
 * Get KI types by subcategory
 */
export function getKiTypesBySubcategory(subcategory: 'edit' | 'create'): KiTypeConfig[] {
  return Object.values(KI_TYPE_CONFIGS).filter((t) => t.subcategory === subcategory);
}

/**
 * Check if KI type requires image upload
 */
export function kiTypeRequiresImage(typeId: ImageStudioKiType): boolean {
  return KI_TYPE_CONFIGS[typeId]?.requiresImage ?? false;
}

/**
 * Get style variant by ID
 */
export function getStyleVariant(variantId: KiStyleVariant): StyleVariantConfig | null {
  return STYLE_VARIANTS.find((v) => v.id === variantId) || null;
}

/**
 * Get infrastructure option by ID
 */
export function getInfrastructureOption(
  optionId: GreenEditInfrastructure
): InfrastructureOptionConfig | null {
  return INFRASTRUCTURE_OPTIONS.find((o) => o.id === optionId) || null;
}
