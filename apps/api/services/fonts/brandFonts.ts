import path from 'node:path';

import { type BrandFontFile } from '@gruenerator/contracts';

import { internContentRoot } from '../skills/internalPrompts.js';

/** Served files plus the cuts only the server renders with. */
export type ServerBrandFontFile = BrandFontFile | 'GothamNarrow-Book.otf' | 'GothamNarrow-Bold.otf';

/**
 * A brand font in the private content checkout (`<INTERN_CONTENT_DIR>/fonts/`).
 * Without it a renderer falls back to its substitute face and logs the miss.
 */
export function brandFontPath(file: ServerBrandFontFile): string {
  return path.join(internContentRoot(), 'fonts', file);
}
