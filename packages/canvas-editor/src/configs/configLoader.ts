/**
 * Dynamic Canvas Config Loader
 *
 * Loads canvas configurations on demand instead of statically importing all configs.
 * This reduces the initial ControllableCanvasWrapper bundle from ~2.3 MB to ~800 KB.
 *
 * Previously, all 6 canvas configs were imported statically in ControllableCanvasWrapper.tsx,
 * which meant every config and its dependencies (sidebar sections, illustrations, etc.)
 * were bundled together even if only one canvas type was used.
 *
 * Now, configs are loaded dynamically based on the canvas type being used.
 */

import { styledFontSpecs } from '@ggraphic/editor/hooks/useFontLoader';
import { getTemplate, type TemplateId } from '@ggraphic/editor/templates/registry';

import { canvasFontFamilies } from '../utils/canvasFontFamilies';

import type { AnyCanvasConfig } from './types';

/**
 * Load a registered canvas configuration dynamically based on type. Each
 * template's loader lives in its registry entry; the host registers its
 * catalogue before the first lookup.
 * @param type - The canvas type to load
 * @param formatId - The canvas's format; only freeform lays out on it, every
 *   other template keeps its own 4:5 sheet
 * @returns Promise resolving to the canvas configuration
 */
export async function loadCanvasConfig(
  type: TemplateId,
  formatId?: string
): Promise<AnyCanvasConfig> {
  const template = getTemplate(type);
  if (!template) throw new Error(`Unknown canvas type: ${type}`);
  // Boundary cast: the registry holds every template's config untyped.
  return (await template.load(formatId)) as AnyCanvasConfig;
}

/**
 * Fetch a template's config chunk and request its fonts before the editor
 * mounts. The canvas type is known as soon as the canvas document arrives,
 * while `useFontLoader` only asks once the first page has rendered — by then
 * the first paint has used the fallback face and has to re-lay out.
 *
 * Best effort: `useFontLoader` still owns the gate, this only gets the
 * requests going earlier.
 */
export async function preloadCanvasTemplate(type: string, formatId?: string): Promise<void> {
  if (getTemplate(type) === undefined || typeof document === 'undefined' || !document.fonts) return;
  try {
    const config = await loadCanvasConfig(type, formatId);
    if (config.fonts?.requireFontLoad === false) return;
    const families = canvasFontFamilies(config);
    const fontSize = config.fonts?.fontSize ?? 60;
    const specs = [
      ...families.map((family) => `${fontSize}px ${family}`),
      ...styledFontSpecs(families, fontSize),
    ];
    await Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => undefined)));
  } catch {
    // The editor loads the config itself and reports a failure there.
  }
}
