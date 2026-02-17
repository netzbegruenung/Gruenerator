/**
 * Image Studio Constants
 * Platform-agnostic configuration for image-studio types
 */

import type {
  ImageStudioTemplateType,
  ImageStudioTypeConfig,
  TemplateFieldConfig,
  InputFieldConfig,
  NormalizedTextResult,
  ImageStudioKiType,
  KiTypeConfig,
  KiStyleVariant,
  GreenEditInfrastructure,
} from './types.js';

// ============================================================================
// TYPE CONFIGURATIONS
// ============================================================================

/**
 * Configuration for all template types (platform-agnostic, no icons)
 */
export const IMAGE_STUDIO_TYPE_CONFIGS: Record<ImageStudioTemplateType, ImageStudioTypeConfig> = {
  dreizeilen: {
    id: 'dreizeilen',
    label: 'Standard-Sharepic',
    description: 'Drei Textzeilen mit Hintergrundbild',
    requiresImage: true,
    hasTextGeneration: true,
    inputBeforeImage: true,
    parallelPreload: true,
    endpoints: {
      text: '/dreizeilen_claude',
      canvas: '/dreizeilen_canvas',
    },
    legacyType: 'Dreizeilen',
  },

  zitat: {
    id: 'zitat',
    label: 'Zitat mit Bild',
    description: 'Zitat mit Hintergrundbild',
    requiresImage: true,
    hasTextGeneration: true,
    endpoints: {
      text: '/zitat_claude',
      canvas: '/zitat_canvas',
    },
    legacyType: 'Zitat',
  },

  'zitat-pure': {
    id: 'zitat-pure',
    label: 'Zitat (Text)',
    description: 'Reines Text-Zitat ohne Bild',
    requiresImage: false,
    hasTextGeneration: true,
    endpoints: {
      text: '/zitat_pure_claude',
      canvas: '/zitat_pure_canvas',
    },
    legacyType: 'Zitat_Pure',
  },

  info: {
    id: 'info',
    label: 'Info-Sharepic',
    description: 'Strukturierte Info mit Header und Body',
    requiresImage: false,
    hasTextGeneration: true,
    endpoints: {
      text: '/info_claude',
      canvas: '/info_canvas',
    },
    legacyType: 'Info',
  },

  veranstaltung: {
    id: 'veranstaltung',
    label: 'Veranstaltung',
    description: 'Event-Ankündigung mit Datum, Ort und Beschreibung',
    requiresImage: true,
    hasTextGeneration: true,
    endpoints: {
      text: '/veranstaltung_claude',
      canvas: '/veranstaltung_canvas',
    },
    legacyType: 'Veranstaltung',
  },

  profilbild: {
    id: 'profilbild',
    label: 'Profilbild',
    description: 'Porträt mit grünem Hintergrund',
    requiresImage: true,
    hasTextGeneration: false,
    endpoints: {
      canvas: '/profilbild_canvas',
    },
    legacyType: 'Profilbild',
  },

  simple: {
    id: 'simple',
    label: 'Text auf Bild',
    description: 'Einfaches Sharepic mit Headline und Subtext',
    requiresImage: true,
    hasTextGeneration: true,
    endpoints: {
      text: '/simple_claude',
      canvas: '/simple_canvas',
    },
    legacyType: 'Simple',
  },
};

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
    id: 'illustration-pure',
    label: 'Illustration',
    description: 'Weicher, künstlerischer Stil',
  },
  {
    id: 'realistic-pure',
    label: 'Realistisch',
    description: 'Fotorealistischer Stil',
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
 * Default style variant
 */
export const DEFAULT_STYLE_VARIANT: KiStyleVariant = 'illustration-pure';

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

// ============================================================================
// FIELD CONFIGURATIONS
// ============================================================================

/**
 * Field configurations for each template type
 */
export const TEMPLATE_FIELD_CONFIGS: Record<ImageStudioTemplateType, TemplateFieldConfig> = {
  dreizeilen: {
    inputFields: [
      {
        name: 'thema',
        type: 'textarea',
        label: 'Thema & Details',
        placeholder:
          'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
        required: true,
        minLength: 3,
      },
    ],
    previewFields: [
      { name: 'line1', type: 'text', label: 'Zeile 1', required: false },
      { name: 'line2', type: 'text', label: 'Zeile 2', required: false },
      { name: 'line3', type: 'text', label: 'Zeile 3', required: false },
    ],
    resultFields: ['line1', 'line2', 'line3'],
    showImageUpload: true,
    showColorControls: true,
    showFontSizeControl: true,
    showAdvancedEditing: true,
    showCredit: true,
    showAlternatives: true,
    alternativesButtonText: 'Anderer Slogan',
    showEditPanel: true,
    minimalLayout: false,
  },

  zitat: {
    inputFields: [
      {
        name: 'thema',
        type: 'textarea',
        label: 'Thema & Details',
        placeholder:
          'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
        required: true,
        minLength: 3,
      },
      {
        name: 'name',
        type: 'text',
        label: 'Zitiert wird',
        placeholder: 'Maxi Mustermensch',
        required: true,
      },
    ],
    previewFields: [{ name: 'quote', type: 'textarea', label: 'Zitat', required: false }],
    resultFields: ['quote'],
    showImageUpload: true,
    showColorControls: false,
    showFontSizeControl: true,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    alternativesButtonText: 'Andere Zitate',
    showEditPanel: true,
    minimalLayout: false,
  },

  'zitat-pure': {
    inputFields: [
      {
        name: 'thema',
        type: 'textarea',
        label: 'Thema & Details',
        placeholder:
          'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
        required: true,
        minLength: 3,
      },
      {
        name: 'name',
        type: 'text',
        label: 'Zitiert wird',
        placeholder: 'Maxi Mustermensch',
        required: true,
      },
    ],
    previewFields: [{ name: 'quote', type: 'textarea', label: 'Zitat', required: false }],
    resultFields: ['quote'],
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: true,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    alternativesButtonText: 'Andere Zitate',
    showEditPanel: true,
    minimalLayout: false,
  },

  info: {
    inputFields: [
      {
        name: 'thema',
        type: 'textarea',
        label: 'Thema & Details',
        placeholder:
          'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...',
        required: true,
        minLength: 3,
      },
    ],
    previewFields: [
      { name: 'header', type: 'text', label: 'Header', required: false },
      { name: 'subheader', type: 'text', label: 'Subheader', required: false },
      { name: 'body', type: 'textarea', label: 'Body', required: false },
    ],
    resultFields: ['header', 'subheader', 'body'],
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    alternativesButtonText: 'Andere Varianten',
    showEditPanel: true,
    minimalLayout: false,
  },

  veranstaltung: {
    inputFields: [
      {
        name: 'thema',
        type: 'textarea',
        label: 'Event-Beschreibung',
        placeholder:
          'z.B. Klimaschutz-Diskussion am 15. Januar 2025 um 19 Uhr im Rathaus Musterstadt, Hauptstraße 1',
        required: true,
        rows: 3,
      },
    ],
    previewFields: [
      {
        name: 'eventTitle',
        type: 'text',
        label: 'Event-Titel',
        placeholder: 'z.B. DISKUSSION',
        required: false,
      },
      {
        name: 'beschreibung',
        type: 'textarea',
        label: 'Beschreibung',
        placeholder: 'z.B. Gemeinsam für mehr Klimaschutz in unserer Stadt!',
        rows: 2,
        required: false,
      },
      {
        name: 'weekday',
        type: 'text',
        label: 'Wochentag (im Kreis)',
        placeholder: 'z.B. MI',
        required: false,
      },
      {
        name: 'date',
        type: 'text',
        label: 'Datum (im Kreis)',
        placeholder: 'z.B. 15.01.',
        required: false,
      },
      {
        name: 'time',
        type: 'text',
        label: 'Uhrzeit (im Kreis)',
        placeholder: 'z.B. 19 UHR',
        required: false,
      },
      {
        name: 'locationName',
        type: 'text',
        label: 'Veranstaltungsort',
        placeholder: 'z.B. Rathaus Musterstadt',
        required: false,
      },
      {
        name: 'address',
        type: 'text',
        label: 'Adresse',
        placeholder: 'z.B. Hauptstraße 1, 12345 Musterstadt',
        required: false,
      },
    ],
    showPreviewLabels: true,
    resultFields: [
      'eventTitle',
      'beschreibung',
      'weekday',
      'date',
      'time',
      'locationName',
      'address',
    ],
    showImageUpload: true,
    showColorControls: false,
    showFontSizeControl: true,
    showGroupedFontSizeControl: true,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    showEditPanel: true,
    minimalLayout: false,
  },

  profilbild: {
    inputFields: [],
    previewFields: [],
    resultFields: [],
    showImageUpload: true,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: false,
    showEditPanel: false,
    minimalLayout: true,
  },

  simple: {
    inputFields: [
      {
        name: 'thema',
        type: 'textarea',
        label: 'Thema & Details',
        placeholder: 'Beschreibe dein Thema, z.B. Mitgliederwerbung, Klimaschutz-Aktion...',
        required: true,
        minLength: 3,
      },
    ],
    previewFields: [
      { name: 'headline', type: 'text', label: 'Headline', required: false },
      { name: 'subtext', type: 'text', label: 'Subtext', required: false },
    ],
    resultFields: ['headline', 'subtext'],
    showImageUpload: true,
    showColorControls: false,
    showFontSizeControl: true,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: false,
    showEditPanel: true,
    minimalLayout: false,
  },
};

// ============================================================================
// RESPONSE MAPPING FUNCTIONS
// ============================================================================

/**
 * Maps API response to normalized result based on type
 */
export function mapTextResponse(
  type: ImageStudioTemplateType,
  response: any
): NormalizedTextResult {
  switch (type) {
    case 'dreizeilen':
      return {
        fields: {
          line1: response.mainSlogan?.line1 || '',
          line2: response.mainSlogan?.line2 || '',
          line3: response.mainSlogan?.line3 || '',
        },
        alternatives: (response.alternatives || []).map((alt: any) => ({
          line1: alt.line1 || '',
          line2: alt.line2 || '',
          line3: alt.line3 || '',
        })),
        searchTerms: response.searchTerms || [],
      };

    case 'zitat':
    case 'zitat-pure':
      return {
        fields: {
          quote: response.quote || '',
          name: response.name || '',
        },
        alternatives: (response.alternatives || []).map((alt: any) => ({
          quote: alt.quote || '',
        })),
      };

    case 'info':
      return {
        fields: {
          header: response.header || '',
          subheader: response.subheader || '',
          body: response.body || '',
        },
        alternatives: (response.alternatives || []).map((alt: any) => ({
          header: alt.header || '',
          subheader: alt.subheader || '',
          body: alt.body || '',
        })),
        searchTerms: response.searchTerms || [],
      };

    case 'veranstaltung':
      const mainEvent = response.mainEvent || response;
      return {
        fields: {
          eventTitle: mainEvent.eventTitle || '',
          beschreibung: mainEvent.beschreibung || '',
          weekday: mainEvent.weekday || '',
          date: mainEvent.date || '',
          time: mainEvent.time || '',
          locationName: mainEvent.locationName || '',
          address: mainEvent.address || '',
        },
        alternatives: (response.alternatives || []).map((alt: any) => ({
          eventTitle: alt.eventTitle || '',
          beschreibung: alt.beschreibung || '',
          weekday: alt.weekday || '',
          date: alt.date || '',
          time: alt.time || '',
          locationName: alt.locationName || '',
          address: alt.address || '',
        })),
        searchTerms: response.searchTerms || [],
      };

    case 'simple':
      return {
        fields: {
          headline: response.headline || '',
          subtext: response.subtext || '',
        },
        alternatives: [],
      };

    default:
      return {
        fields: {},
        alternatives: [],
      };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get type configuration by ID
 */
export function getTypeConfig(typeId: ImageStudioTemplateType): ImageStudioTypeConfig | null {
  return IMAGE_STUDIO_TYPE_CONFIGS[typeId] || null;
}

/**
 * Get field configuration by type ID
 */
export function getFieldConfig(typeId: ImageStudioTemplateType): TemplateFieldConfig | null {
  return TEMPLATE_FIELD_CONFIGS[typeId] || null;
}

/**
 * Get all template types as array
 */
export function getAllTemplateTypes(): ImageStudioTypeConfig[] {
  return Object.values(IMAGE_STUDIO_TYPE_CONFIGS);
}

/**
 * Get types that require image upload
 */
export function getTypesRequiringImage(): ImageStudioTypeConfig[] {
  return Object.values(IMAGE_STUDIO_TYPE_CONFIGS).filter((t) => t.requiresImage);
}

/**
 * Get types with text generation
 */
export function getTypesWithTextGeneration(): ImageStudioTypeConfig[] {
  return Object.values(IMAGE_STUDIO_TYPE_CONFIGS).filter((t) => t.hasTextGeneration);
}

/**
 * Check if a type requires image upload
 */
export function typeRequiresImage(typeId: ImageStudioTemplateType): boolean {
  return IMAGE_STUDIO_TYPE_CONFIGS[typeId]?.requiresImage ?? false;
}

/**
 * Check if a type has text generation
 */
export function typeHasTextGeneration(typeId: ImageStudioTemplateType): boolean {
  return IMAGE_STUDIO_TYPE_CONFIGS[typeId]?.hasTextGeneration ?? false;
}

/**
 * Get the text endpoint for a type
 */
export function getTextEndpoint(typeId: ImageStudioTemplateType): string | null {
  return IMAGE_STUDIO_TYPE_CONFIGS[typeId]?.endpoints.text || null;
}

/**
 * Get the canvas endpoint for a type
 */
export function getCanvasEndpoint(typeId: ImageStudioTemplateType): string | null {
  return IMAGE_STUDIO_TYPE_CONFIGS[typeId]?.endpoints.canvas || null;
}

/**
 * Get input fields for a type
 */
export function getInputFields(typeId: ImageStudioTemplateType): InputFieldConfig[] {
  return TEMPLATE_FIELD_CONFIGS[typeId]?.inputFields || [];
}

/**
 * Get preview fields for a type
 */
export function getPreviewFields(typeId: ImageStudioTemplateType): InputFieldConfig[] {
  return TEMPLATE_FIELD_CONFIGS[typeId]?.previewFields || [];
}
