import { registerBrandPacks, activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { FONT_FAMILY_ALIASES, aliasFontFamily } from '@ggraphic/editor/utils/fontAliases';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GRUENE_BRAND_PACKS } from './grueneBrandPacks';

const original = activeBrand();
beforeEach(() => registerBrandPacks(GRUENE_BRAND_PACKS));
afterEach(() => registerBrandPacks([original]));

// ggraphic swaps PT Sans for Instrument Sans and Vollkorn for Fraunces unless a
// registered pack declares the family. The Grünerator ships both, so a stored
// text in either must keep its face.
describe("ggraphic's font aliases against the Grünerator packs", () => {
  it('leaves PT Sans and Vollkorn alone', () => {
    expect(aliasFontFamily('PT Sans')).toBe('PT Sans');
    expect(aliasFontFamily('Vollkorn')).toBe('Vollkorn');
  });

  it('leaves every family the packs declare alone', () => {
    for (const pack of GRUENE_BRAND_PACKS) {
      const { boldFamilies, ...roles } = pack.fonts;
      const families = [
        ...Object.values(roles),
        ...Object.keys(boldFamilies ?? {}),
        ...Object.values(boldFamilies ?? {}),
        ...pack.fontFaces.map((face) => face.family),
      ];
      for (const family of families) expect(aliasFontFamily(family), family).toBe(family);
    }
  });

  it('knows no alias beyond those two', () => {
    expect(Object.keys(FONT_FAMILY_ALIASES).sort()).toEqual(['PT Sans', 'Vollkorn']);
  });
});
