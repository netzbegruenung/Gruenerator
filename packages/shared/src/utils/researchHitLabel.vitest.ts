import { describe, it, expect } from 'vitest';

import { formatResearchHitCount } from './researchHitLabel.js';

describe('formatResearchHitCount', () => {
  it('beschriftet Erwähnungen als Untergrenze', () => {
    // Gemessen untertreibt der Zähler in einem Drittel der Fälle und
    // überschreitet die Wahrheit nie — "mind." ist deshalb die einzige Aussage,
    // die durch die Messung gedeckt ist.
    expect(formatResearchHitCount(5, 8)).toBe('mind. 5 Erwähnungen');
    expect(formatResearchHitCount(1, 3)).toBe('mind. 1 Erwähnung');
  });

  it('fällt ohne wörtlichen Treffer auf die Abschnitte zurück', () => {
    expect(formatResearchHitCount(0, 4)).toBe('4 Textabschnitte');
    expect(formatResearchHitCount(0, 1)).toBe('1 Textabschnitt');
  });

  it('behandelt ein fehlendes Feld wie einen rein semantischen Treffer', () => {
    // Ältere Server kennen `term_chunk_count` nicht — das Feld ist additiv
    // nachgereicht, die Karte darf daran nicht zerbrechen.
    expect(formatResearchHitCount(undefined, 3)).toBe('3 Textabschnitte');
    expect(formatResearchHitCount(null, 2)).toBe('2 Textabschnitte');
    expect(formatResearchHitCount(null, undefined)).toBe('0 Textabschnitte');
  });
});
