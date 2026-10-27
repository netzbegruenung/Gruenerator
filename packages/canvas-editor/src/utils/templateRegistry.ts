/**
 * Template Registry - Metadata for all canvas templates
 *
 * Provides display information for template selection UI. The metadata
 * itself lives with each template in `templates/registry.ts`.
 */

import {
  DEFAULT_FORMAT_ID,
  getCanvasFormatOrDefault,
  pinnedFormatId,
} from '@ggraphic/editor/formats/index';

import { BUILTIN_TEMPLATES } from '../templates/registry';

import type { BrandLocale } from '../brand/theme';
import type {
  CanvasConfigId,
  TemplateAudience,
  TemplateCategory,
  TemplatePickerInfo,
} from '../templates/registry';

export type { TemplateAudience, TemplateCategory } from '../templates/registry';

export interface TemplateInfo extends TemplatePickerInfo {
  id: CanvasConfigId;
}

/**
 * Display metadata of every built-in template, derived from
 * `BUILTIN_TEMPLATES` (picker order).
 */
export const TEMPLATE_REGISTRY = Object.fromEntries(
  BUILTIN_TEMPLATES.map((t) => [t.id, { id: t.id, ...t.info }])
) as Record<CanvasConfigId, TemplateInfo>;

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

/** Effective audience of a template (undefined defaults to 'de-DE'). */
function templateAudience(t: TemplateInfo): TemplateAudience {
  return t.audience ?? 'de-DE';
}

/**
 * Templates offered to a given locale — the audience-aware filter used by the
 * studio picker. AT users see only 'de-AT' (+ 'all') templates; DE users see
 * 'de-DE' (+ 'all'). Mirrors isAgentVisibleForLocale in agents/audience.ts.
 */
export function getTemplatesForLocale(locale: BrandLocale): TemplateInfo[] {
  return getAllTemplates().filter((t) => {
    if (t.hiddenFromPicker) return false;
    const a = templateAudience(t);
    return a === 'all' || a === locale;
  });
}

/**
 * Can a page of this template sit in a document of this format? A template
 * with a pinned sheet fits only that format; every other template fits the
 * default format, and any other only if it follows it — a fixed sheet would
 * be stretched to the document's stage. A print format takes only the blank
 * freeform page.
 */
export function templateFitsFormat(configId: CanvasConfigId, formatId?: string): boolean {
  // Resolve first: legacy rows carry removed format ids that render 4:5.
  const format = getCanvasFormatOrDefault(formatId);
  // On print only the blank freeform page fits: its sheet is built from the format.
  if (format.category === 'print') return configId === 'freeform' || configId === 'freeform-at';
  const resolved = format.id;
  const pinned = pinnedFormatId(configId);
  if (pinned) return resolved === pinned;
  return resolved === DEFAULT_FORMAT_ID || !!TEMPLATE_REGISTRY[configId]?.followsFormat;
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
  return ['zitat', 'simple', 'veranstaltung', 'dreizeilen', 'freeform'].includes(configId);
}

/**
 * Check if a template supports solid color backgrounds
 */
export function templateSupportsSolidBackground(configId: CanvasConfigId): boolean {
  return ['info', 'zitat-pure', 'slider', 'slider-at', 'freeform'].includes(configId);
}
