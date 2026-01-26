/**
 * Image Modification Transformers
 * Transform between UI state and API request formats
 */

import type {
  DreizeilenModificationParams,
  ZitatModificationParams,
  VeranstaltungModificationParams,
  GroupedFontSizes,
  DreizeilenColorScheme,
  BarColor,
} from './modification-types.js';
import type { CanvasGenerationRequest, VeranstaltungFontSizes, ColorScheme } from './types.js';
import {
  VERANSTALTUNG_BASE_FONT_SIZES,
  GROUPED_FONT_SIZE_FIELDS,
  BRAND_COLORS,
} from './modification-constants.js';

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Calculate contrast color (black or white) based on background luminance
 */
export function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');

  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance (ITU-R BT.709)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.5 ? BRAND_COLORS.TANNE : BRAND_COLORS.SAND;
}

/**
 * Ensure color has text property (derive from background if missing)
 */
export function normalizeBarColor(color: BarColor): ColorScheme {
  return {
    background: color.background,
    text: color.text || getContrastColor(color.background),
  };
}

/**
 * Normalize entire color scheme (ensure all have text colors)
 */
export function normalizeColorScheme(scheme: DreizeilenColorScheme): ColorScheme[] {
  return scheme.map(normalizeBarColor);
}

// ============================================================================
// VERANSTALTUNG FONT SIZE TRANSFORMERS
// ============================================================================

/**
 * Convert grouped percentage-based font sizes to per-field pixel sizes
 */
export function groupedToFieldFontSizes(grouped: GroupedFontSizes): VeranstaltungFontSizes {
  const result: VeranstaltungFontSizes = {};

  // Main fields
  for (const field of GROUPED_FONT_SIZE_FIELDS.main) {
    result[field] = Math.round(VERANSTALTUNG_BASE_FONT_SIZES[field] * (grouped.main / 100));
  }

  // Circle fields
  for (const field of GROUPED_FONT_SIZE_FIELDS.circle) {
    result[field] = Math.round(VERANSTALTUNG_BASE_FONT_SIZES[field] * (grouped.circle / 100));
  }

  // Footer fields
  for (const field of GROUPED_FONT_SIZE_FIELDS.footer) {
    result[field] = Math.round(VERANSTALTUNG_BASE_FONT_SIZES[field] * (grouped.footer / 100));
  }

  return result;
}

/**
 * Convert per-field pixel sizes to grouped percentages (approximate)
 */
export function fieldToGroupedFontSizes(fieldSizes: VeranstaltungFontSizes): GroupedFontSizes {
  const calculateGroupAverage = (fields: readonly (keyof VeranstaltungFontSizes)[]) => {
    let total = 0;
    let count = 0;
    for (const field of fields) {
      if (fieldSizes[field] !== undefined) {
        total += (fieldSizes[field]! / VERANSTALTUNG_BASE_FONT_SIZES[field]) * 100;
        count++;
      }
    }
    return count > 0 ? Math.round(total / count) : 100;
  };

  return {
    main: calculateGroupAverage(GROUPED_FONT_SIZE_FIELDS.main),
    circle: calculateGroupAverage(GROUPED_FONT_SIZE_FIELDS.circle),
    footer: calculateGroupAverage(GROUPED_FONT_SIZE_FIELDS.footer),
  };
}

// ============================================================================
// CANVAS REQUEST BUILDERS
// ============================================================================

/**
 * Apply dreizeilen modification params to canvas request
 */
export function applyDreizeilenParams(
  request: CanvasGenerationRequest,
  params: DreizeilenModificationParams
): CanvasGenerationRequest {
  return {
    ...request,
    fontSize: params.fontSize,
    balkenOffset: [...params.balkenOffset],
    colorScheme: normalizeColorScheme(params.colorScheme),
    balkenGruppenOffset: [...params.balkenGruppenOffset],
    sunflowerOffset: [...params.sunflowerOffset],
    credit: params.credit,
  };
}

/**
 * Apply zitat modification params to canvas request
 */
export function applyZitatParams(
  request: CanvasGenerationRequest,
  params: ZitatModificationParams
): CanvasGenerationRequest {
  return {
    ...request,
    fontSize: params.fontSize,
  };
}

/**
 * Apply veranstaltung modification params to canvas request
 */
export function applyVeranstaltungParams(
  request: CanvasGenerationRequest,
  params: VeranstaltungModificationParams
): CanvasGenerationRequest {
  return {
    ...request,
    veranstaltungFieldFontSizes: groupedToFieldFontSizes(params.groupedFontSizes),
  };
}

/**
 * Apply modification params to canvas request based on type
 */
export function applyModificationParams(
  request: CanvasGenerationRequest,
  type: string,
  params:
    | DreizeilenModificationParams
    | ZitatModificationParams
    | VeranstaltungModificationParams
    | null
): CanvasGenerationRequest {
  if (!params) return request;

  switch (type) {
    case 'dreizeilen':
      return applyDreizeilenParams(request, params as DreizeilenModificationParams);
    case 'zitat':
    case 'zitat-pure':
      return applyZitatParams(request, params as ZitatModificationParams);
    case 'veranstaltung':
      return applyVeranstaltungParams(request, params as VeranstaltungModificationParams);
    default:
      return request;
  }
}

// ============================================================================
// STATE HELPERS
// ============================================================================

/**
 * Deep clone modification params (handles arrays properly)
 */
export function cloneModificationParams<T extends object>(params: T): T {
  if (params === null || typeof params !== 'object') return params;

  // Handle arrays
  if (Array.isArray(params)) {
    return params.map((item) =>
      typeof item === 'object' && item !== null ? { ...item } : item
    ) as unknown as T;
  }

  // Handle objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null ? { ...item } : item
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = { ...value };
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/**
 * Check if two color schemes are equal
 */
export function areColorSchemesEqual(a: DreizeilenColorScheme, b: DreizeilenColorScheme): boolean {
  if (!a || !b || a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i].background !== b[i].background) return false;
  }

  return true;
}

/**
 * Find matching preset ID for a color scheme
 */
export function findColorSchemePresetId(
  scheme: DreizeilenColorScheme,
  presets: { id: string; colors: DreizeilenColorScheme }[]
): string | null {
  const match = presets.find((preset) => areColorSchemesEqual(preset.colors, scheme));
  return match?.id || null;
}
