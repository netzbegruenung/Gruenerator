/**
 * Component Registry for Text2Sharepic
 *
 * Central registry for managing sharepic visual components
 */

import { registerFont } from 'canvas';
import fs from 'fs';
import type { CanvasRenderingContext2D } from 'canvas';
import { FONT_PATH, PTSANS_REGULAR_PATH, PTSANS_BOLD_PATH, COLORS } from '../sharepic/canvas/config.js';
import { createLogger } from '../../utils/logger.js';
import type { ComponentDefinition, Bounds, CorporateDesign } from './types.js';

const log = createLogger('Components');

// Register fonts on module load
try {
  registerFont(FONT_PATH, { family: 'GrueneTypeNeue' });
  if (fs.existsSync(PTSANS_REGULAR_PATH)) {
    registerFont(PTSANS_REGULAR_PATH, { family: 'PTSans-Regular' });
  }
  if (fs.existsSync(PTSANS_BOLD_PATH)) {
    registerFont(PTSANS_BOLD_PATH, { family: 'PTSans-Bold' });
  }
} catch (err: any) {
  log.warn(`Font registration warning: ${err.message}`);
}

/**
 * Corporate Design constants
 */
export const CORPORATE_DESIGN: CorporateDesign = {
  colors: {
    tanne: '#005538',
    klee: '#008939',
    grashalm: '#8ABD24',
    sand: '#F5F1E9',
    white: '#FFFFFF',
    black: '#000000',
    zitatBg: '#6ccd87',
    ...COLORS
  },
  fonts: {
    primary: 'GrueneTypeNeue',
    secondary: 'PTSans-Regular',
    secondaryBold: 'PTSans-Bold'
  },
  spacing: {
    small: 20,
    medium: 40,
    large: 60,
    xlarge: 80
  }
};

/**
 * Component Registry
 */
const componentRegistry = new Map<string, ComponentDefinition>();
const registeredComponents: string[] = [];

/**
 * Register a component in the library
 */
export function registerComponent(type: string, definition: Omit<ComponentDefinition, 'type' | 'registeredAt'>): void {
  componentRegistry.set(type, {
    type,
    ...definition,
    registeredAt: Date.now()
  });
  registeredComponents.push(type);
}

/**
 * Get a component definition by type
 */
export function getComponent(type: string): ComponentDefinition | undefined {
  return componentRegistry.get(type);
}

/**
 * List all available components
 */
export function listComponents(): Array<{
  type: string;
  description: string;
  parameters: ComponentDefinition['parameters'];
  category: ComponentDefinition['category'];
}> {
  return Array.from(componentRegistry.entries()).map(([type, def]) => ({
    type,
    description: def.description,
    parameters: def.parameters,
    category: def.category
  }));
}

/**
 * Wrap text to fit within a maximum width
 */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];

  // First split by explicit newlines
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Render a component with given parameters
 */
export async function renderComponent(
  ctx: CanvasRenderingContext2D,
  componentType: string,
  params: Record<string, any>,
  bounds: Bounds
): Promise<boolean | null> {
  const component = getComponent(componentType);

  if (!component) {
    console.warn(`[ComponentLibrary] Unknown component: ${componentType}`);
    return null;
  }

  try {
    // Merge defaults with provided params
    const mergedParams: Record<string, any> = {};
    for (const [key, schema] of Object.entries(component.parameters)) {
      mergedParams[key] = params[key] !== undefined ? params[key] : schema.default;
    }

    return await component.render(ctx, mergedParams, bounds);
  } catch (error: any) {
    console.error(`[ComponentLibrary] Error rendering ${componentType}:`, error);
    return null;
  }
}

/**
 * Get corporate design constants
 */
export function getCorporateDesign(): CorporateDesign {
  return { ...CORPORATE_DESIGN };
}

/**
 * Get count of registered components
 */
export function getRegisteredCount(): number {
  return registeredComponents.length;
}

/**
 * Log registration summary (called after all components are registered)
 */
export function logRegistrationSummary(): void {
  if (registeredComponents.length > 0) {
    log.info(`Registered ${registeredComponents.length} components`);
  }
}
