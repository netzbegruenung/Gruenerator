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
  | 'info-at'
  | 'zitat-at'
  | 'zitat-pure-at'
  | 'dreizeilen-at'
  | 'freeform-at';

// Use a flexible type that accepts any state/action types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCanvasConfig = FullCanvasConfig<any, any>;

/**
 * Load a canvas configuration dynamically based on type
 * @param type - The canvas type to load
 * @returns Promise resolving to the canvas configuration
 */
export async function loadCanvasConfig(type: CanvasConfigType): Promise<AnyCanvasConfig> {
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
      return (await import('./freeform_full.config')).freeformFullConfig;

    case 'profilbild':
      return (await import('./profilbild_full.config')).profilbildFullConfig;

    // Österreich (de-AT) variants
    case 'zitat-pure-at':
      return (await import('./zitat_pure_at_full.config')).zitatPureAtFullConfig;

    case 'zitat-at':
      return (await import('./zitat_at_full.config')).zitatAtFullConfig;

    case 'info-at':
      return (await import('./info_at_full.config')).infoAtFullConfig;

    case 'dreizeilen-at':
      return (await import('./dreizeilen_at_full.config')).dreizeilenAtFullConfig;

    case 'freeform-at':
      return (await import('./freeform_at_full.config')).freeformAtFullConfig;

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
    'info-at',
    'zitat-at',
    'zitat-pure-at',
    'dreizeilen-at',
    'freeform-at',
  ].includes(type);
}
