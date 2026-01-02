/**
 * Layout Validator for Text2Sharepic
 *
 * Validates AI-generated layouts against component schemas and constraints.
 * Ensures colors are from the allowed palette and numeric values are within bounds.
 * Returns corrected layouts when possible.
 */

import type {
  ZoneConfig,
  LayoutPlan,
  GeneratedText,
  ParamsValidationResult,
  ZoneValidationResult,
  LayoutValidationResult,
  TextValidationResult,
  AIOutputValidationResult,
  NumericConstraint
} from './types.js';

import { getComponent, CORPORATE_DESIGN } from './ComponentRegistry.js';
import { getTemplate, validateComponentPlacement } from './zoneTemplates.js';

const ALLOWED_COLORS = Object.values(CORPORATE_DESIGN.colors);

export const CONSTRAINTS: Record<string, NumericConstraint> = {
  fontSize: { min: 30, max: 120 },
  opacity: { min: 0, max: 1 },
  size: { min: 20, max: 500 },
  spacing: { min: 0, max: 100 },
  angle: { min: 0, max: 20 }
};

/**
 * Resolve color name to hex value
 */
function resolveColor(color: string): string | null {
  if (!color) return null;
  if (typeof color !== 'string') return null;

  // If already a hex color, return as-is
  if (color.startsWith('#')) return color;

  // Try to find color by name (case-insensitive)
  const colorName = color.toLowerCase();
  const colorEntry = Object.entries(CORPORATE_DESIGN.colors).find(
    ([key]) => key.toLowerCase() === colorName
  );

  if (colorEntry) {
    return colorEntry[1]; // Return the hex value
  }

  return null;
}

/**
 * Check if a color is in the allowed palette
 */
export function isAllowedColor(color: any): boolean {
  if (!color) return true;
  if (typeof color !== 'string') return false;

  // First try to resolve color name to hex
  const resolved = resolveColor(color);
  if (resolved) {
    return ALLOWED_COLORS.some(c => c.toLowerCase() === resolved.toLowerCase());
  }

  const normalizedColor = color.toLowerCase();
  return ALLOWED_COLORS.some(c => c.toLowerCase() === normalizedColor);
}

/**
 * Find the closest allowed color (or resolve name to hex)
 */
function findClosestColor(color: string): string {
  // First try to resolve color name to hex
  const resolved = resolveColor(color);
  if (resolved && isAllowedColor(resolved)) {
    return resolved;
  }

  if (isAllowedColor(color)) return color;

  // Default to tanne (primary green)
  return CORPORATE_DESIGN.colors.tanne;
}

/**
 * Clamp a numeric value to a valid range
 */
function clampValue(value: any, constraint: NumericConstraint): any {
  if (typeof value !== 'number') return value;
  return Math.max(constraint.min, Math.min(constraint.max, value));
}

/**
 * Check if imagePath is valid (either @auto-select placeholder or real path)
 */
export function isValidImagePath(imagePath: any): boolean {
  if (!imagePath) return false;
  // Accept @auto-select placeholder (will be resolved later)
  if (imagePath === '@auto-select') return true;
  // Accept any string path (existence checked during render)
  return typeof imagePath === 'string' && imagePath.length > 0;
}

/**
 * Validate and correct component parameters
 */
export function validateParams(params: Record<string, any>, componentType: string): ParamsValidationResult {
  const component = getComponent(componentType);
  if (!component) return { params, warnings: [`Unknown component: ${componentType}`] };

  const correctedParams = { ...params };
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(correctedParams)) {
    // Validate imagePath for background-image component
    if (key === 'imagePath' && componentType === 'background-image') {
      if (!isValidImagePath(value)) {
        warnings.push(`Invalid imagePath "${value}", using @auto-select`);
        correctedParams[key] = '@auto-select';
      }
    }

    // Validate colors
    if (key.toLowerCase().includes('color')) {
      if (!isAllowedColor(value)) {
        const correctedColor = findClosestColor(value);
        warnings.push(`Invalid color "${value}" for ${key}, using ${correctedColor}`);
        correctedParams[key] = correctedColor;
      }
    }

    // Validate fontSize
    if (key === 'fontSize') {
      const clamped = clampValue(value, CONSTRAINTS.fontSize);
      if (clamped !== value) {
        warnings.push(`fontSize ${value} clamped to ${clamped}`);
        correctedParams[key] = clamped;
      }
    }

    // Validate opacity
    if (key === 'opacity') {
      const clamped = clampValue(value, CONSTRAINTS.opacity);
      if (clamped !== value) {
        warnings.push(`${key} ${value} clamped to ${clamped}`);
        correctedParams[key] = clamped;
      }
    }

    // Validate size
    if (key === 'size') {
      const clamped = clampValue(value, CONSTRAINTS.size);
      if (clamped !== value) {
        warnings.push(`size ${value} clamped to ${clamped}`);
        correctedParams[key] = clamped;
      }
    }

    // Validate angle
    if (key === 'angle') {
      const clamped = clampValue(value, CONSTRAINTS.angle);
      if (clamped !== value) {
        warnings.push(`angle ${value} clamped to ${clamped}`);
        correctedParams[key] = clamped;
      }
    }
  }

  return { params: correctedParams, warnings };
}

/**
 * Validate a single zone configuration
 */
export function validateZone(zone: ZoneConfig, templateId: string): ZoneValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check zone has required fields
  if (!zone.zoneName) {
    errors.push('Zone missing zoneName');
    return { valid: false, errors, warnings, corrected: null };
  }

  if (!zone.component) {
    errors.push(`Zone "${zone.zoneName}" missing component`);
    return { valid: false, errors, warnings, corrected: null };
  }

  // Check component exists
  const component = getComponent(zone.component);
  if (!component) {
    warnings.push(`Unknown component "${zone.component}" in zone "${zone.zoneName}"`);
    return { valid: true, errors, warnings, corrected: null };
  }

  // Check component is allowed in this zone
  const placementValidation = validateComponentPlacement(templateId, zone.zoneName, zone.component);
  if (!placementValidation.valid) {
    warnings.push(placementValidation.error!);
  }

  // Validate and correct params
  const paramsValidation = validateParams(zone.params || {}, zone.component);
  warnings.push(...paramsValidation.warnings);

  const correctedZone: ZoneConfig = {
    ...zone,
    params: paramsValidation.params
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    corrected: correctedZone
  };
}

/**
 * Validate a complete layout
 */
export function validateLayout(layout: LayoutPlan): LayoutValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check layout structure
  if (!layout) {
    return { valid: false, errors: ['Layout is null or undefined'], warnings, corrected: null };
  }

  if (!layout.templateId) {
    errors.push('Layout missing templateId');
  }

  if (!layout.zones || !Array.isArray(layout.zones)) {
    errors.push('Layout missing zones array');
    return { valid: false, errors, warnings, corrected: null };
  }

  // Validate template exists
  const template = getTemplate(layout.templateId);
  if (!template) {
    errors.push(`Unknown template: ${layout.templateId}`);
    return { valid: false, errors, warnings, corrected: null };
  }

  // Validate each zone
  const correctedZones: ZoneConfig[] = [];
  for (const zone of layout.zones) {
    const zoneValidation = validateZone(zone, layout.templateId);

    errors.push(...zoneValidation.errors);
    warnings.push(...zoneValidation.warnings);

    if (zoneValidation.corrected) {
      correctedZones.push(zoneValidation.corrected);
    } else if (zoneValidation.valid) {
      correctedZones.push(zone);
    }
    // Skip zones with errors
  }

  // Check for required zones
  const requiredZones = template.zones.filter(z => z.required).map(z => z.name);
  const providedZones = correctedZones.map(z => z.zoneName);

  for (const required of requiredZones) {
    if (!providedZones.includes(required)) {
      warnings.push(`Required zone "${required}" not provided`);
    }
  }

  // Ensure background zone exists
  if (!providedZones.includes('background')) {
    // Add default background if missing
    correctedZones.unshift({
      zoneName: 'background',
      component: 'background-solid',
      params: { color: CORPORATE_DESIGN.colors.tanne }
    });
    warnings.push('Added default background zone');
  }

  const correctedLayout: LayoutPlan = {
    ...layout,
    zones: correctedZones
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    corrected: correctedLayout
  };
}

/**
 * Validate generated text content
 */
export function validateGeneratedText(generatedText: GeneratedText): TextValidationResult {
  const warnings: string[] = [];

  if (!generatedText) {
    return { valid: true, warnings: ['No generated text provided'] };
  }

  // Check text lengths
  if (generatedText.headline && generatedText.headline.length > 100) {
    warnings.push(`Headline too long (${generatedText.headline.length} chars), may be truncated`);
  }

  if (generatedText.quote && generatedText.quote.length > 300) {
    warnings.push(`Quote too long (${generatedText.quote.length} chars), may be truncated`);
  }

  if (generatedText.lines && Array.isArray(generatedText.lines)) {
    generatedText.lines.forEach((line, i) => {
      if (line && line.length > 50) {
        warnings.push(`Line ${i + 1} may be too long for balken (${line.length} chars)`);
      }
    });
  }

  return { valid: true, warnings };
}

/**
 * Full validation of AI-generated output
 */
export function validateAIOutput(aiOutput: any): AIOutputValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!aiOutput) {
    return { valid: false, errors: ['AI output is null'], warnings, corrected: null };
  }

  // Validate generated text
  const textValidation = validateGeneratedText(aiOutput.generatedText);
  warnings.push(...textValidation.warnings);

  // Validate layout
  const layoutValidation = validateLayout(aiOutput.layout);
  errors.push(...layoutValidation.errors);
  warnings.push(...layoutValidation.warnings);

  return {
    valid: layoutValidation.valid,
    errors,
    warnings,
    corrected: layoutValidation.valid && layoutValidation.corrected ? {
      generatedText: aiOutput.generatedText,
      layout: layoutValidation.corrected
    } : null
  };
}
