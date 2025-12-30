/**
 * Sharepic Constants
 * Shared constants for sharepic generation across web and mobile.
 */

import type { SharepicType, SharepicTypeOption } from './types';

/** All available sharepic type options */
export const SHAREPIC_TYPES: readonly SharepicTypeOption[] = [
  {
    id: 'default',
    label: 'Standard (3 automatisch)',
    shortLabel: 'Standard',
    supportsImage: false,
    requiresAuthor: false,
  },
  {
    id: 'dreizeilen',
    label: '3-Zeilen Slogan',
    shortLabel: '3-Zeilen',
    supportsImage: true,
    requiresAuthor: false,
  },
  {
    id: 'quote',
    label: 'Zitat mit Bild',
    shortLabel: 'Zitat+Bild',
    supportsImage: true,
    requiresAuthor: true,
  },
  {
    id: 'quote_pure',
    label: 'Zitat ohne Bild',
    shortLabel: 'Zitat',
    supportsImage: false,
    requiresAuthor: true,
  },
  {
    id: 'info',
    label: 'Infopost',
    shortLabel: 'Info',
    supportsImage: false,
    requiresAuthor: false,
  },
] as const;

/** API endpoint for single sharepic generation */
export const SHAREPIC_ENDPOINT = '/generate-sharepic';

/** API endpoint for default (3 auto) sharepics generation */
export const DEFAULT_SHAREPICS_ENDPOINT = '/default_claude';

/** Map frontend type IDs to backend type identifiers */
export const SHAREPIC_TYPE_MAP: Record<SharepicType, string> = {
  default: 'default',
  dreizeilen: 'dreizeilen',
  quote: 'zitat',
  quote_pure: 'zitat_pure',
  info: 'info',
};

/** Get sharepic type option by ID */
export function getSharepicTypeOption(id: SharepicType): SharepicTypeOption | undefined {
  return SHAREPIC_TYPES.find((t) => t.id === id);
}

/** Check if a sharepic type supports image upload */
export function sharepicTypeSupportsImage(type: SharepicType): boolean {
  return getSharepicTypeOption(type)?.supportsImage ?? false;
}

/** Check if a sharepic type requires an author */
export function sharepicTypeRequiresAuthor(type: SharepicType): boolean {
  return getSharepicTypeOption(type)?.requiresAuthor ?? false;
}
