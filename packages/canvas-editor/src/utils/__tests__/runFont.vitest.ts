/**
 * Welcher Schnitt ein Lauf bekommt. „Kursiv schlägt fett" gilt für jede
 * Schrift ohne echten Fett-Kursiv-Schnitt; Vollkorn hat einen (Black Italic,
 * CI 2026 S. 22) und darf ihn anfordern.
 */
import { PLAIN_STYLE } from '@gruenerator/contracts';
import { describe, it, expect } from 'vitest';

import { runFont } from '../textUtils';

const accentRun = { ...PLAIN_STYLE, accent: true };

describe('runFont', () => {
  it('keeps `bold italic` for a Vollkorn accent', () => {
    const accent = { fill: '#FCEC00', fontFamily: 'Vollkorn', fontStyle: 'bold italic' as const };
    expect(runFont('GothamNarrow-Ultra', 'normal', accentRun, accent)).toEqual({
      fontFamily: 'Vollkorn',
      fontStyle: 'bold italic',
    });
  });

  it('an own accent colour only colours: the run keeps the block font', () => {
    const accent = { fill: '#FCEC00', fontFamily: 'Vollkorn', fontStyle: 'bold italic' as const };
    expect(
      runFont('GothamNarrow-Ultra', 'normal', { ...accentRun, accentColor: '#0BA1DD' }, accent)
    ).toEqual({ fontFamily: 'GothamNarrow-Ultra', fontStyle: 'normal' });
  });

  it('keeps `bold italic` for a whole Vollkorn block', () => {
    expect(runFont('Vollkorn', 'bold italic', PLAIN_STYLE, null).fontStyle).toBe('bold italic');
  });

  it('leaves a plain Vollkorn italic at Bold Italic', () => {
    expect(runFont('Vollkorn', 'italic', PLAIN_STYLE, null).fontStyle).toBe('italic');
  });

  it('still lets italic win for faces without a bold italic', () => {
    expect(runFont('GrueneTypeNeue', 'bold italic', PLAIN_STYLE, null).fontStyle).toBe('italic');
    expect(runFont('PT Sans', 'bold', { ...PLAIN_STYLE, italic: true }, null).fontStyle).toBe(
      'italic'
    );
  });

  it('sets a bold Gotham Book run in the Gotham Bold cut, upright', () => {
    const bold = { ...PLAIN_STYLE, bold: true };
    expect(runFont('GothamNarrow-Book', 'normal', bold, null)).toEqual({
      fontFamily: 'GothamNarrow-Bold',
      fontStyle: 'normal',
    });
    expect(runFont('GothamNarrow-Book', 'bold', PLAIN_STYLE, null)).toEqual({
      fontFamily: 'GothamNarrow-Bold',
      fontStyle: 'normal',
    });
    expect(runFont('GothamNarrow-Book', 'normal', PLAIN_STYLE, null).fontFamily).toBe(
      'GothamNarrow-Book'
    );
  });
});
