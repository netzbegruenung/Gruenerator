import { resolveFontRole } from '@ggraphic/core';
import { describe, expect, it } from 'vitest';

import { GRUENE_AT, GRUENE_DE } from './grueneBrand.js';

describe('resolveFontRole', () => {
  it('reads every DE role off the pack', () => {
    expect(resolveFontRole(GRUENE_DE.fonts, 'headline')).toBe('GrueneTypeNeue');
    expect(resolveFontRole(GRUENE_DE.fonts, 'body')).toBe('PT Sans');
    expect(resolveFontRole(GRUENE_DE.fonts, 'quoteShort')).toBe('GrueneTypeNeue');
    expect(resolveFontRole(GRUENE_DE.fonts, 'quoteEmphasis')).toBe('GrueneTypeNeue');
  });

  it('reads every AT role off the pack', () => {
    expect(resolveFontRole(GRUENE_AT.fonts, 'headline')).toBe('GothamNarrow-Ultra');
    expect(resolveFontRole(GRUENE_AT.fonts, 'body')).toBe('GothamNarrow-Book');
    expect(resolveFontRole(GRUENE_AT.fonts, 'quoteShort')).toBe('GothamNarrow-Ultra');
    expect(resolveFontRole(GRUENE_AT.fonts, 'quoteEmphasis')).toBe('Vollkorn');
  });

  it('gives null for handwriting while no pack sets one', () => {
    expect(resolveFontRole(GRUENE_DE.fonts, 'handwriting')).toBeNull();
    expect(resolveFontRole(GRUENE_AT.fonts, 'handwriting')).toBeNull();
  });

  it('gives the family of a pack that sets handwriting', () => {
    expect(resolveFontRole({ ...GRUENE_DE.fonts, handwriting: 'Caveat' }, 'handwriting')).toBe(
      'Caveat'
    );
  });
});
