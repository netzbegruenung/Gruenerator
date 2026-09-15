import { describe, expect, it } from 'vitest';

import { toExcerpt } from './syncEventRecorder.js';

describe('toExcerpt', () => {
  it('strips a leading markdown heading marker', () => {
    expect(toExcerpt('## Waermeplanung\n\nDie Kommunen brauchen Planungssicherheit.')).toBe(
      'Waermeplanung Die Kommunen brauchen Planungssicherheit.'
    );
  });

  it('strips a leading list marker', () => {
    expect(toExcerpt('- Netze ausbauen\n- Foerderung sichern')).toBe(
      'Netze ausbauen Foerderung sichern'
    );
  });

  it('strips a leading enumerator marker (dot or bracket)', () => {
    expect(toExcerpt('1. Netze ausbauen\n2) Foerderung sichern')).toBe(
      'Netze ausbauen Foerderung sichern'
    );
  });

  it('leaves plain prose unchanged', () => {
    expect(toExcerpt('Die Fraktion hat ein Papier beschlossen.')).toBe(
      'Die Fraktion hat ein Papier beschlossen.'
    );
  });
});
