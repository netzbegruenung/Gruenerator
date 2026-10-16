import { describe, expect, it } from '@jest/globals';

import { PHOSPHOR_GLYPHS, resolvePhosphorGlyph } from './AgentGlyph';

/**
 * Das Web speichert react-icons-Namen (`PiSparkleFill`), System-Agents
 * Konzept-Schlüssel (`hand-heart`). Beides muss mobil dasselbe Symbol treffen.
 */
describe('resolvePhosphorGlyph', () => {
  it('maps a react-icons name to the glyph in regular weight', () => {
    expect(resolvePhosphorGlyph('PiMegaphone')).toEqual({
      glyph: PHOSPHOR_GLYPHS.PiMegaphone,
      weight: 'regular',
    });
  });

  it('reads the weight off the react-icons suffix', () => {
    expect(resolvePhosphorGlyph('PiSparkleFill')).toEqual({
      glyph: PHOSPHOR_GLYPHS.PiSparkle,
      weight: 'fill',
    });
  });

  it('maps system concept keys like the web registry', () => {
    expect(resolvePhosphorGlyph('layout-grid')?.glyph).toBe(PHOSPHOR_GLYPHS.PiSquaresFour);
  });

  it('leaves icons outside the bundled set to the Ionicons fallback', () => {
    expect(resolvePhosphorGlyph('PiAirplaneTilt')).toBeNull();
    expect(resolvePhosphorGlyph(null)).toBeNull();
  });
});
