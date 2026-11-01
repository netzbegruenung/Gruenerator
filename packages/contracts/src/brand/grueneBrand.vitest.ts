import { type BrandFontRole, resolveRef } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';

import { GRUENE_AT, GRUENE_DE } from './grueneBrand.js';

const fontOf = (brand: typeof GRUENE_DE, role: BrandFontRole) =>
  resolveRef(`font.${role}`, brand, null);

describe('font roles of the packs', () => {
  it('reads every DE role off the pack', () => {
    expect(fontOf(GRUENE_DE, 'headline')).toBe('GrueneTypeNeue');
    expect(fontOf(GRUENE_DE, 'body')).toBe('PT Sans');
    expect(fontOf(GRUENE_DE, 'quoteShort')).toBe('GrueneTypeNeue');
    expect(fontOf(GRUENE_DE, 'quoteEmphasis')).toBe('GrueneTypeNeue');
  });

  it('reads every AT role off the pack', () => {
    expect(fontOf(GRUENE_AT, 'headline')).toBe('GothamNarrow-Ultra');
    expect(fontOf(GRUENE_AT, 'body')).toBe('GothamNarrow-Book');
    expect(fontOf(GRUENE_AT, 'quoteShort')).toBe('GothamNarrow-Ultra');
    expect(fontOf(GRUENE_AT, 'quoteEmphasis')).toBe('Vollkorn');
  });

  it('has no handwriting role: the composer keeps that family host-side', () => {
    expect(Object.keys(GRUENE_DE.fonts)).not.toContain('handwriting');
    expect(Object.keys(GRUENE_AT.fonts)).not.toContain('handwriting');
  });
});
