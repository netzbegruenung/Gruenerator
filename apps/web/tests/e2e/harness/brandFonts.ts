import { type BrandFontFile } from '@gruenerator/contracts';

import { installBrandFonts } from '../../../src/assets/styles/common/brandFonts';

/**
 * The harnesses run without a backend, so the brand fonts come straight from the
 * private checkout the API's dev fallback reads too. Rendering without them
 * would bake the fallback face into thumbnails and fail every pixel comparison
 * for the wrong reason, so a missing checkout stops the harness instead.
 */
const FONT_URLS = import.meta.glob<string>('../../../../../.external/gruenerator-intern/fonts/*', {
  query: '?url',
  import: 'default',
  eager: true,
  // Without it Vite's glob skips dot directories like `.external`.
  exhaustive: true,
});

const byFile = new Map(
  Object.entries(FONT_URLS).map(([key, url]) => [key.slice(key.lastIndexOf('/') + 1), url])
);

export function installHarnessBrandFonts(): void {
  if (byFile.size === 0) {
    throw new Error(
      'Hausschriften fehlen: gruenerator-intern nach .external/gruenerator-intern/ klonen'
    );
  }
  installBrandFonts((file: BrandFontFile) => byFile.get(file) ?? file);
}
