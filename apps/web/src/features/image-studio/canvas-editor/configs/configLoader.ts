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

import type { CanvasConfig } from './types';

type CanvasConfigType =
  | 'zitat-pure'
  | 'info'
  | 'veranstaltung'
  | 'simple'
  | 'dreizeilen'
  | 'zitat';

/**
 * Load a canvas configuration dynamically based on type
 * @param type - The canvas type to load
 * @returns Promise resolving to the canvas configuration
 */
export async function loadCanvasConfig(type: CanvasConfigType): Promise<CanvasConfig> {
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
    'zitat'
  ].includes(type);
}
