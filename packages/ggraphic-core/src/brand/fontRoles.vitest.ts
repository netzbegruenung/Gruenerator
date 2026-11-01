// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';
import { type BrandFonts } from './brandPack';
import { bindFontRole, currentFontRole, fontRoleOptions } from './fontRoles';

const TWO: BrandFonts = {
  headline: 'Alpha Sans',
  body: 'Beta Serif',
  quoteShort: 'Alpha Sans',
  quoteEmphasis: 'Beta Serif',
};
const THREE: BrandFonts = {
  headline: 'Alpha Sans',
  body: 'Beta Serif',
  quoteShort: 'Alpha Sans',
  quoteEmphasis: 'Gamma Slab',
};

describe('fontRoleOptions', () => {
  it('offers one role per distinct family, first role wins', () => {
    expect(fontRoleOptions(TWO)).toEqual([
      { role: 'headline', family: 'Alpha Sans' },
      { role: 'body', family: 'Beta Serif' },
    ]);
  });

  it('offers a third role when the brand has a third family, in stable order', () => {
    expect(fontRoleOptions(THREE).map((o) => o.role)).toEqual([
      'headline',
      'body',
      'quoteEmphasis',
    ]);
  });

  it('offers quoteShort when it differs from the earlier families', () => {
    const fonts = { ...THREE, quoteShort: 'Delta Narrow' };
    expect(fontRoleOptions(fonts).map((o) => o.role)).toEqual([
      'headline',
      'body',
      'quoteEmphasis',
      'quoteShort',
    ]);
  });

  it('offers handwriting only when the pack sets it', () => {
    expect(fontRoleOptions(TWO).map((o) => o.role)).not.toContain('handwriting');
    const withHand = { ...TWO, handwriting: 'Epsilon Script' };
    expect(fontRoleOptions(withHand).map((o) => o.role)).toEqual([
      'headline',
      'body',
      'handwriting',
    ]);
  });

  it('compares the first family of a stack', () => {
    const fonts = { ...TWO, quoteShort: '"Alpha Sans", Arial, sans-serif' };
    expect(fontRoleOptions(fonts).map((o) => o.role)).toEqual(['headline', 'body']);
  });
});

describe('currentFontRole', () => {
  const options = fontRoleOptions(THREE);

  it('prefers the bound role', () => {
    const bind = bindFontRole(THREE, 'body')!.bind;
    expect(currentFontRole({ fontFamily: 'Whatever', bind }, options)).toBe('body');
  });

  it('falls back to the role whose family the text uses, stack tail ignored', () => {
    expect(currentFontRole({ fontFamily: 'Gamma Slab, Arial, sans-serif' }, options)).toBe(
      'quoteEmphasis'
    );
  });

  it('ignores a binding to a role that is not offered and matches by family', () => {
    const bind = bindFontRole(THREE, 'quoteShort')!.bind;
    expect(currentFontRole({ fontFamily: 'Alpha Sans', bind }, options)).toBe('headline');
  });

  it('is null for a family no role has', () => {
    expect(currentFontRole({ fontFamily: 'Unknown' }, options)).toBeNull();
    expect(currentFontRole({ fontFamily: '' }, options)).toBeNull();
  });
});

describe('bindFontRole', () => {
  it('writes the family and the binding together', () => {
    expect(bindFontRole(THREE, 'quoteEmphasis')).toEqual({
      fontFamily: 'Gamma Slab',
      bind: { fontFamily: { ref: 'font.quoteEmphasis', value: 'Gamma Slab' } },
    });
  });

  it('is null for a role the brand does not set', () => {
    expect(bindFontRole(TWO, 'handwriting')).toBeNull();
  });
});
