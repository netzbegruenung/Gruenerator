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

import { getCanvasFormatOrDefault } from '../formats';
import { styledFontSpecs } from '../hooks/useFontLoader';
import { canvasFontFamilies } from '../utils/canvasFontFamilies';

import type { FullCanvasConfig } from './types';

type CanvasConfigType =
  | 'zitat-pure'
  | 'info'
  | 'veranstaltung'
  | 'simple'
  | 'dreizeilen'
  | 'zitat'
  | 'slider'
  | 'freeform'
  | 'profilbild'
  // Österreich (de-AT) variants
  | 'zitat-at'
  | 'zitat-pure-at'
  | 'dreizeilen-overlay-at'
  | 'info-at'
  | 'freeform-at'
  | 'slider-at';

// Use a flexible type that accepts any state/action types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCanvasConfig = FullCanvasConfig<any, any>;

/**
 * Load a canvas configuration dynamically based on type
 * @param type - The canvas type to load
 * @param formatId - The canvas's format; only freeform lays out on it, every
 *   other template keeps its own 4:5 sheet
 * @returns Promise resolving to the canvas configuration
 */
export async function loadCanvasConfig(
  type: CanvasConfigType,
  formatId?: string
): Promise<AnyCanvasConfig> {
  switch (type) {
    case 'zitat-pure':
      return (await import('./zitat_pure_full.config')).zitatPureFullConfig;

    case 'info':
      return (await import('./info_full.config')).infoFullConfig;

    case 'veranstaltung':
      return (await import('./veranstaltung_full.config')).veranstaltungFullConfig;

    case 'simple':
      return (await import('./simple_full.config')).simpleFullConfig;

    case 'dreizeilen':
      return (await import('./dreizeilen_full.config')).dreizeilenFullConfig;

    case 'zitat':
      return (await import('./zitat_full.config')).zitatFullConfig;

    case 'slider':
      return (await import('./slider_full.config')).sliderFullConfig;

    case 'freeform':
      return (await import('./freeform_full.config')).createFreeformFullConfig(
        getCanvasFormatOrDefault(formatId)
      );

    case 'profilbild':
      return (await import('./profilbild_full.config')).profilbildFullConfig;

    // Österreich (de-AT) variants
    case 'zitat-pure-at':
      return (await import('./zitat_pure_at_full.config')).zitatPureAtFullConfig;

    case 'zitat-at':
      return (await import('./zitat_at_full.config')).zitatAtFullConfig;

    case 'dreizeilen-overlay-at':
      return (await import('./dreizeilen_overlay_at_full.config')).dreizeilenOverlayAtFullConfig;

    case 'info-at':
      return (await import('./info_at_full.config')).infoAtFullConfig;

    case 'freeform-at':
      return (await import('./freeform_at_full.config')).createFreeformAtFullConfig(
        getCanvasFormatOrDefault(formatId)
      );

    case 'slider-at':
      return (await import('./slider_full.config')).sliderAtFullConfig;

    default:
      throw new Error(`Unknown canvas type: ${type}`);
  }
}

/**
 * Check if a canvas type is valid
 */
export function isValidCanvasType(type: string): type is CanvasConfigType {
  return [
    'zitat-pure',
    'info',
    'veranstaltung',
    'simple',
    'dreizeilen',
    'zitat',
    'slider',
    'freeform',
    'profilbild',
    'zitat-at',
    'zitat-pure-at',
    'dreizeilen-overlay-at',
    'info-at',
    'freeform-at',
    'slider-at',
  ].includes(type);
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
  if (!isValidCanvasType(type) || typeof document === 'undefined' || !document.fonts) return;
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
