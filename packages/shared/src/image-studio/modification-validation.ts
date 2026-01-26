/**
 * Image Modification Validation
 * Validation functions for modification parameters
 */

import type {
  BalkenOffset,
  Offset2D,
  DreizeilenColorScheme,
  BarColor,
  GroupedFontSizes,
  DreizeilenModificationParams,
  ZitatModificationParams,
  VeranstaltungModificationParams,
} from './modification-types.js';
import { MODIFICATION_CONTROLS_CONFIG } from './modification-constants.js';

// ============================================================================
// VALIDATION RESULT TYPE
// ============================================================================

export interface ModificationValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

// ============================================================================
// INDIVIDUAL VALIDATORS
// ============================================================================

/**
 * Validate a single numeric value within range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): ModificationValidationResult {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: `${fieldName} muss eine Zahl sein` };
  }
  if (value < min || value > max) {
    return {
      valid: true,
      warnings: [
        `${fieldName} (${value}) liegt außerhalb des empfohlenen Bereichs (${min}-${max})`,
      ],
    };
  }
  return { valid: true };
}

/**
 * Validate font size
 */
export function validateFontSize(
  fontSize: number,
  isZitat: boolean = false
): ModificationValidationResult {
  const config = isZitat
    ? MODIFICATION_CONTROLS_CONFIG.fontSize.zitat
    : MODIFICATION_CONTROLS_CONFIG.fontSize.standard;

  return validateRange(fontSize, config.min, config.max, 'Schriftgröße');
}

/**
 * Validate balken offset array
 */
export function validateBalkenOffset(offset: BalkenOffset): ModificationValidationResult {
  if (!Array.isArray(offset) || offset.length !== 3) {
    return { valid: false, error: 'Balken-Offset muss ein Array mit 3 Werten sein' };
  }

  const { min, max } = MODIFICATION_CONTROLS_CONFIG.balkenOffset;
  const warnings: string[] = [];

  for (let i = 0; i < 3; i++) {
    const result = validateRange(offset[i], min, max, `Zeile ${i + 1} Offset`);
    if (!result.valid) return result;
    if (result.warnings) warnings.push(...result.warnings);
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Validate 2D offset
 */
export function validateOffset2D(
  offset: Offset2D,
  fieldName: string
): ModificationValidationResult {
  if (!Array.isArray(offset) || offset.length !== 2) {
    return { valid: false, error: `${fieldName} muss ein Array mit 2 Werten sein` };
  }

  for (const val of offset) {
    if (typeof val !== 'number' || isNaN(val)) {
      return { valid: false, error: `${fieldName} Werte müssen Zahlen sein` };
    }
  }

  return { valid: true };
}

/**
 * Validate hex color string
 */
export function validateHexColor(color: string, fieldName: string): ModificationValidationResult {
  if (typeof color !== 'string') {
    return { valid: false, error: `${fieldName} muss ein Text sein` };
  }

  const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!hexRegex.test(color)) {
    return { valid: false, error: `${fieldName} muss eine gültige Hex-Farbe sein (z.B. #005538)` };
  }
  return { valid: true };
}

/**
 * Validate bar color
 */
export function validateBarColor(barColor: BarColor, index: number): ModificationValidationResult {
  if (!barColor || typeof barColor !== 'object') {
    return { valid: false, error: `Farbe ${index + 1} ist ungültig` };
  }
  return validateHexColor(barColor.background, `Farbe ${index + 1}`);
}

/**
 * Validate color scheme (3 bars)
 */
export function validateColorScheme(scheme: DreizeilenColorScheme): ModificationValidationResult {
  if (!Array.isArray(scheme) || scheme.length !== 3) {
    return { valid: false, error: 'Farbschema muss 3 Farben enthalten' };
  }

  for (let i = 0; i < 3; i++) {
    const result = validateBarColor(scheme[i], i);
    if (!result.valid) return result;
  }

  return { valid: true };
}

/**
 * Validate grouped font sizes (percentage)
 */
export function validateGroupedFontSizes(sizes: GroupedFontSizes): ModificationValidationResult {
  const { min, max } = MODIFICATION_CONTROLS_CONFIG.groupedFontSize;
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(sizes)) {
    const result = validateRange(value, min, max, key);
    if (!result.valid) return result;
    if (result.warnings) warnings.push(...result.warnings);
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Validate credit text
 */
export function validateCredit(credit: string): ModificationValidationResult {
  if (typeof credit !== 'string') {
    return { valid: false, error: 'Credit muss ein Text sein' };
  }
  if (credit.length > 50) {
    return {
      valid: true,
      warnings: ['Credit ist länger als 50 Zeichen und wird möglicherweise abgeschnitten'],
    };
  }
  return { valid: true };
}

// ============================================================================
// COMPOSITE VALIDATORS
// ============================================================================

/**
 * Validate complete dreizeilen modification params
 */
export function validateDreizeilenParams(
  params: DreizeilenModificationParams
): ModificationValidationResult {
  const warnings: string[] = [];

  // Font size
  const fontSizeResult = validateFontSize(params.fontSize, false);
  if (!fontSizeResult.valid) return fontSizeResult;
  if (fontSizeResult.warnings) warnings.push(...fontSizeResult.warnings);

  // Balken offset
  const balkenResult = validateBalkenOffset(params.balkenOffset);
  if (!balkenResult.valid) return balkenResult;
  if (balkenResult.warnings) warnings.push(...balkenResult.warnings);

  // Color scheme
  const colorResult = validateColorScheme(params.colorScheme);
  if (!colorResult.valid) return colorResult;

  // Group offset
  const groupResult = validateOffset2D(params.balkenGruppenOffset, 'Balkengruppen-Offset');
  if (!groupResult.valid) return groupResult;

  // Sunflower offset
  const sunflowerResult = validateOffset2D(params.sunflowerOffset, 'Sonnenblumen-Offset');
  if (!sunflowerResult.valid) return sunflowerResult;

  // Credit
  const creditResult = validateCredit(params.credit);
  if (!creditResult.valid) return creditResult;
  if (creditResult.warnings) warnings.push(...creditResult.warnings);

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Validate zitat modification params
 */
export function validateZitatParams(params: ZitatModificationParams): ModificationValidationResult {
  return validateFontSize(params.fontSize, true);
}

/**
 * Validate veranstaltung modification params
 */
export function validateVeranstaltungParams(
  params: VeranstaltungModificationParams
): ModificationValidationResult {
  return validateGroupedFontSizes(params.groupedFontSizes);
}

/**
 * Validate modification params by type
 */
export function validateModificationParams(
  type: string,
  params: unknown
): ModificationValidationResult {
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Parameter sind ungültig' };
  }

  switch (type) {
    case 'dreizeilen':
      return validateDreizeilenParams(params as DreizeilenModificationParams);
    case 'zitat':
    case 'zitat-pure':
      return validateZitatParams(params as ZitatModificationParams);
    case 'veranstaltung':
      return validateVeranstaltungParams(params as VeranstaltungModificationParams);
    default:
      return { valid: true };
  }
}
