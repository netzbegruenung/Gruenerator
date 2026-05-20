/**
 * Template Registry - Metadata for all canvas templates
 *
 * Provides display information for template selection UI.
 * Keeps template metadata in one place for easy maintenance.
 */

import type { CanvasConfigId } from '../configs/types';

export type TemplateCategory = 'sharepic' | 'slider' | 'plakat' | 'presentation' | 'profilbild';

export interface TemplateInfo {
  id: CanvasConfigId;
  label: string;
  description: string;
  previewImage: string;
  category: TemplateCategory;
}

/**
 * Registry of all available canvas templates with their display metadata
 */
export const TEMPLATE_REGISTRY: Record<CanvasConfigId, TemplateInfo> = {
  dreizeilen: {
    id: 'dreizeilen',
    label: '3 Zeilen',
    description: 'Drei Textzeilen mit Hintergrundbild',
    previewImage: '/imagine/previews/dreizeilen-preview.webp',
    category: 'sharepic',
  },
  zitat: {
    id: 'zitat',
    label: 'Zitat',
    description: 'Zitat mit Hintergrundbild',
    previewImage: '/imagine/previews/zitat-preview.webp',
    category: 'sharepic',
  },
  'zitat-pure': {
    id: 'zitat-pure',
    label: 'Zitat Pur',
    description: 'Zitat ohne Hintergrundbild',
    previewImage: '/imagine/previews/zitat-pure-preview.webp',
    category: 'sharepic',
  },
  simple: {
    id: 'simple',
    label: 'Einfach',
    description: 'Überschrift und Unterzeile mit Bild',
    previewImage: '/imagine/previews/simple-preview.webp',
    category: 'sharepic',
  },
  info: {
    id: 'info',
    label: 'Info',
    description: 'Überschrift und Text ohne Bild',
    previewImage: '/imagine/previews/info-preview.webp',
    category: 'sharepic',
  },
  veranstaltung: {
    id: 'veranstaltung',
    label: 'Event',
    description: 'Veranstaltungsankündigung',
    previewImage: '/imagine/previews/veranstaltung-preview.webp',
    category: 'sharepic',
  },
  'veranstaltung-plakat': {
    id: 'veranstaltung-plakat',
    label: 'Event-Plakat',
    description: 'Veranstaltungsankündigung im Plakat-Format',
    previewImage: '/imagine/previews/veranstaltung-plakat-preview.svg',
    category: 'plakat',
  },
  slider: {
    id: 'slider',
    label: 'Slider',
    description: 'Slider-Post mit Pill-Badge und Pfeil',
    previewImage: '/imagine/previews/slider-preview.webp',
    category: 'slider',
  },
  freeform: {
    id: 'freeform',
    label: 'Freies Design',
    description: 'Leere Leinwand zum freien Gestalten',
    previewImage: '/imagine/previews/freeform-preview.webp',
    category: 'sharepic',
  },
  'pres-title': {
    id: 'pres-title',
    label: 'Nur Titel',
    description: 'Titelfolie mit Sonnenblume',
    previewImage: '/imagine/previews/pres-title-preview.webp',
    category: 'presentation',
  },
  'pres-image': {
    id: 'pres-image',
    label: 'Bild mit Überschrift',
    description: 'Vollbild-Foto mit Textoverlay',
    previewImage: '/imagine/previews/pres-image-preview.webp',
    category: 'presentation',
  },
  'pres-content': {
    id: 'pres-content',
    label: 'Inhalt',
    description: 'Titel mit Text, optional zweispaltig',
    previewImage: '/imagine/previews/pres-content-preview.webp',
    category: 'presentation',
  },
  profilbild: {
    id: 'profilbild',
    label: 'Profilbild',
    description: 'Profilbild mit transparentem Vordergrund auf farbigem Hintergrund',
    previewImage: '/imagine/previews/profilbild-preview.webp',
    category: 'profilbild',
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
 * Get the category for a template ID. Returns undefined for unknown ids.
 */
export function getCategoryForTemplate(configId: CanvasConfigId): TemplateCategory | undefined {
  return TEMPLATE_REGISTRY[configId]?.category;
}

/**
 * Check if a template supports image backgrounds
 * Used to determine if background can be inherited
 */
export function templateSupportsImageBackground(configId: CanvasConfigId): boolean {
  return [
    'zitat',
    'simple',
    'veranstaltung',
    'veranstaltung-plakat',
    'dreizeilen',
    'freeform',
    'pres-image',
  ].includes(configId);
}

/**
 * Check if a template supports solid color backgrounds
 */
export function templateSupportsSolidBackground(configId: CanvasConfigId): boolean {
  return ['info', 'zitat-pure', 'slider', 'freeform', 'pres-title', 'pres-content'].includes(
    configId
  );
}
