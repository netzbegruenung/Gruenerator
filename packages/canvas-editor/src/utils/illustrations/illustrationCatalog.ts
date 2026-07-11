/**
 * Synchronous access to the complete illustration catalog, including the
 * ~1600-entry undraw set (~280 KB of metadata).
 *
 * Import this ONLY from modules that already live in a lazy chunk (the
 * assets sidebar section). Eager editor-core code must go through the async
 * loaders in registry.ts instead, so the catalog stays out of the initial
 * editor bundle.
 */

import { ILLLUSTRATIONS } from './illlustrations';
import { KAWAII_ILLUSTRATIONS } from './kawaii';
import { OPENDOODLES } from './opendoodles';
import { UNDRAW_ALL } from './undrawAll';

import type { IllustrationDef, SvgDef } from './types';

export const ALL_ILLUSTRATIONS: IllustrationDef[] = [
  ...KAWAII_ILLUSTRATIONS,
  ...OPENDOODLES,
  ...ILLLUSTRATIONS,
  ...UNDRAW_ALL,
];

export const ALL_SVG_ILLUSTRATIONS: SvgDef[] = [...OPENDOODLES, ...ILLLUSTRATIONS, ...UNDRAW_ALL];

export { UNDRAW_ALL };
