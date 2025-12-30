/**
 * Image Modification Constants
 * Defaults, presets, ranges, and UI labels
 */

import type {
  FontSizeOption,
  ColorSchemePreset,
  DreizeilenModificationParams,
  ZitatModificationParams,
  VeranstaltungModificationParams,
  GroupedFontSizes,
  ModificationControlsConfig,
  DreizeilenColorScheme,
} from './modification-types';
import type { VeranstaltungFontSizes } from './types';

// ============================================================================
// BRAND COLORS
// ============================================================================

export const BRAND_COLORS = {
  TANNE: '#005538',
  KLEE: '#008939',
  GRASHALM: '#8ABD24',
  SAND: '#F5F1E9',
  HIMMEL: '#009EE3',
  WHITE: '#FFFFFF',
  BLACK: '#000000',
} as const;

// ============================================================================
// FONT SIZE CONSTANTS
// ============================================================================

export const FONT_SIZES = {
  S: 75,
  M: 85,
  L: 105,
} as const;

export const ZITAT_FONT_SIZES = {
  S: 50,
  M: 60,
  L: 75,
} as const;

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { label: 'S', value: FONT_SIZES.S },
  { label: 'M', value: FONT_SIZES.M },
  { label: 'L', value: FONT_SIZES.L },
];

export const ZITAT_FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { label: 'S', value: ZITAT_FONT_SIZES.S },
  { label: 'M', value: ZITAT_FONT_SIZES.M },
  { label: 'L', value: ZITAT_FONT_SIZES.L },
];

// ============================================================================
// OFFSET CONSTANTS
// ============================================================================

export const BALKEN_OFFSET_CONFIG = {
  MIN: -250,
  MAX: 250,
  STEP: 50,
  COUNT: 3,
} as const;

export const BALKEN_GRUPPE_STEP = 100;
export const SUNFLOWER_STEP = 25;

// ============================================================================
// COLOR SCHEME PRESETS
// ============================================================================

export const DEFAULT_COLOR_SCHEME: DreizeilenColorScheme = [
  { background: BRAND_COLORS.TANNE, text: BRAND_COLORS.SAND },
  { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
  { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
];

export const COLOR_SCHEME_PRESETS: ColorSchemePreset[] = [
  {
    id: 'tanne-sand-sand',
    name: 'Tanne-Sand-Sand',
    colors: [
      { background: BRAND_COLORS.TANNE, text: BRAND_COLORS.SAND },
      { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
      { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
    ],
  },
  {
    id: 'sand-tanne-tanne',
    name: 'Sand-Tanne-Tanne',
    colors: [
      { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
      { background: BRAND_COLORS.TANNE, text: BRAND_COLORS.SAND },
      { background: BRAND_COLORS.TANNE, text: BRAND_COLORS.SAND },
    ],
  },
  {
    id: 'sand-tanne-sand',
    name: 'Sand-Tanne-Sand',
    colors: [
      { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
      { background: BRAND_COLORS.TANNE, text: BRAND_COLORS.SAND },
      { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
    ],
  },
  {
    id: 'sand-sand-tanne',
    name: 'Sand-Sand-Tanne',
    colors: [
      { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
      { background: BRAND_COLORS.SAND, text: BRAND_COLORS.TANNE },
      { background: BRAND_COLORS.TANNE, text: BRAND_COLORS.SAND },
    ],
  },
];

// ============================================================================
// DEFAULT MODIFICATION PARAMETERS
// ============================================================================

export const DEFAULT_DREIZEILEN_PARAMS: DreizeilenModificationParams = {
  fontSize: FONT_SIZES.S,
  balkenOffset: [50, -100, 50],
  colorScheme: [...DEFAULT_COLOR_SCHEME],
  balkenGruppenOffset: [30, 0],
  sunflowerOffset: [0, 0],
  credit: '',
};

export const DEFAULT_ZITAT_PARAMS: ZitatModificationParams = {
  fontSize: ZITAT_FONT_SIZES.M,
};

export const DEFAULT_GROUPED_FONT_SIZES: GroupedFontSizes = {
  main: 100,
  circle: 100,
  footer: 100,
};

export const DEFAULT_VERANSTALTUNG_PARAMS: VeranstaltungModificationParams = {
  groupedFontSizes: { ...DEFAULT_GROUPED_FONT_SIZES },
};

// ============================================================================
// VERANSTALTUNG BASE FONT SIZES (for percentage calculation)
// ============================================================================

export const VERANSTALTUNG_BASE_FONT_SIZES: Required<VeranstaltungFontSizes> = {
  eventTitle: 94,
  beschreibung: 62,
  weekday: 57,
  date: 55,
  time: 55,
  locationName: 42,
  address: 42,
};

export const GROUPED_FONT_SIZE_FIELDS = {
  main: ['eventTitle', 'beschreibung'] as const,
  circle: ['weekday', 'date', 'time'] as const,
  footer: ['locationName', 'address'] as const,
};

// ============================================================================
// CONTROLS CONFIGURATION
// ============================================================================

export const MODIFICATION_CONTROLS_CONFIG: ModificationControlsConfig = {
  fontSize: {
    standard: {
      min: 75,
      max: 110,
      step: 1,
      defaultValue: FONT_SIZES.S,
    },
    zitat: {
      min: 45,
      max: 80,
      step: 1,
      defaultValue: ZITAT_FONT_SIZES.M,
    },
    presets: FONT_SIZE_OPTIONS,
    zitatPresets: ZITAT_FONT_SIZE_OPTIONS,
  },
  balkenOffset: {
    min: BALKEN_OFFSET_CONFIG.MIN,
    max: BALKEN_OFFSET_CONFIG.MAX,
    step: BALKEN_OFFSET_CONFIG.STEP,
    defaultValue: 0,
    count: BALKEN_OFFSET_CONFIG.COUNT,
  },
  balkenGruppe: {
    step: BALKEN_GRUPPE_STEP,
  },
  sunflower: {
    step: SUNFLOWER_STEP,
  },
  groupedFontSize: {
    min: 70,
    max: 130,
    step: 1,
    defaultValue: 100,
  },
};

// ============================================================================
// UI LABELS (German)
// ============================================================================

export const MODIFICATION_LABELS = {
  // Screen titles
  TITLE: 'Anpassen',
  REGENERATING: 'Wird aktualisiert...',
  ADVANCED_TOGGLE: 'Erweiterter Editor',
  CONTINUE: 'Weiter',

  // Section titles
  FONT_SIZE: 'Schriftgröße',
  COLOR_SCHEME: 'Farbschema',
  CREDIT: 'Bildnachweis / Credit',
  ADVANCED_EDITING: 'Erweiterter Editor',
  ADVANCED_EDITING_SUBTITLE: 'für Expert*innen',

  // Basic controls
  FONT_SIZE_CUSTOM: 'Eigene Größe',

  // Advanced controls
  BALKEN_POSITION: 'Einzelne Balken verschieben',
  BALKEN_POSITION_DESC: 'Passe die Position jedes einzelnen Balkens individuell an.',
  BALKEN_GRUPPE: 'Balkengruppe verschieben',
  BALKEN_GRUPPE_DESC: 'Verschiebe die gesamte Balkengruppe auf dem Bild.',
  SUNFLOWER: 'Sonnenblume verschieben',
  SUNFLOWER_DESC: 'Passe die Position der Sonnenblume auf dem Bild an.',

  // Grouped font sizes
  MAIN_TEXT: 'Haupttext',
  DATE_CIRCLE: 'Datum-Kreis',
  FOOTER_LOCATION: 'Ort & Adresse',

  // Actions
  RESET: 'Zurücksetzen',
  APPLY: 'Übernehmen',

  // Bar labels
  LINE_1: 'Zeile 1',
  LINE_2: 'Zeile 2',
  LINE_3: 'Zeile 3',

  // Placeholder
  CREDIT_PLACEHOLDER: 'www.gruene-musterdorf.de',
} as const;

// ============================================================================
// HELPER: Get default params by type
// ============================================================================

export function getDefaultModificationParams(
  type: string
): DreizeilenModificationParams | ZitatModificationParams | VeranstaltungModificationParams | null {
  switch (type) {
    case 'dreizeilen':
      return {
        fontSize: DEFAULT_DREIZEILEN_PARAMS.fontSize,
        balkenOffset: [...DEFAULT_DREIZEILEN_PARAMS.balkenOffset],
        colorScheme: DEFAULT_DREIZEILEN_PARAMS.colorScheme.map(c => ({ ...c })) as DreizeilenColorScheme,
        balkenGruppenOffset: [...DEFAULT_DREIZEILEN_PARAMS.balkenGruppenOffset] as [number, number],
        sunflowerOffset: [...DEFAULT_DREIZEILEN_PARAMS.sunflowerOffset] as [number, number],
        credit: DEFAULT_DREIZEILEN_PARAMS.credit,
      };
    case 'zitat':
    case 'zitat-pure':
      return { fontSize: DEFAULT_ZITAT_PARAMS.fontSize };
    case 'veranstaltung':
      return {
        groupedFontSizes: { ...DEFAULT_VERANSTALTUNG_PARAMS.groupedFontSizes },
      };
    default:
      return null;
  }
}

// ============================================================================
// HELPER: Check if type supports modifications
// ============================================================================

export function typeSupportsModifications(type: string): boolean {
  return ['dreizeilen', 'zitat', 'zitat-pure', 'veranstaltung'].includes(type);
}
