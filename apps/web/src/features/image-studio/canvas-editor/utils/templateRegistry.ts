/**
 * Template Registry - Metadata for all canvas templates
 *
 * Provides display information for template selection UI.
 * Keeps template metadata in one place for easy maintenance.
 */

import type { CanvasConfigId } from '../configs/types';

export interface TemplateInfo {
  id: CanvasConfigId;
  label: string;
  description: string;
  previewImage: string;
}

/**
 * Registry of all available canvas templates with their display metadata
 */
export const TEMPLATE_REGISTRY: Record<CanvasConfigId, TemplateInfo> = {
  dreizeilen: {
    id: 'dreizeilen',
    label: '3 Zeilen',
    description: 'Drei Textzeilen mit Hintergrundbild',
    previewImage: '/imagine/previews/dreizeilen-preview.png',
  },
  zitat: {
    id: 'zitat',
    label: 'Zitat',
    description: 'Zitat mit Hintergrundbild',
    previewImage: '/imagine/previews/zitat-preview.png',
  },
  'zitat-pure': {
    id: 'zitat-pure',
    label: 'Zitat Pur',
    description: 'Zitat ohne Hintergrundbild',
    previewImage: '/imagine/previews/zitat-pure-preview.png',
  },
  simple: {
    id: 'simple',
    label: 'Einfach',
    description: 'Überschrift und Unterzeile mit Bild',
    previewImage: '/imagine/previews/simple-preview.png',
  },
  info: {
    id: 'info',
    label: 'Info',
    description: 'Überschrift und Text ohne Bild',
    previewImage: '/imagine/previews/info-preview.png',
  },
  veranstaltung: {
    id: 'veranstaltung',
    label: 'Event',
    description: 'Veranstaltungsankündigung',
    previewImage: '/imagine/previews/veranstaltung-preview.png',
  },
};

/**
 * Get template info by ID
 */
export function getTemplateInfo(configId: CanvasConfigId): TemplateInfo {
  return TEMPLATE_REGISTRY[configId];
}

/**
 * Get all templates as an array (for rendering lists)
 */
export function getAllTemplates(): TemplateInfo[] {
  return Object.values(TEMPLATE_REGISTRY);
}

/**
 * Check if a template supports image backgrounds
 * Used to determine if background can be inherited
 */
export function templateSupportsImageBackground(configId: CanvasConfigId): boolean {
  return ['zitat', 'simple', 'veranstaltung', 'dreizeilen'].includes(configId);
}

/**
 * Check if a template supports solid color backgrounds
 */
export function templateSupportsSolidBackground(configId: CanvasConfigId): boolean {
  return ['info', 'zitat-pure'].includes(configId);
}
