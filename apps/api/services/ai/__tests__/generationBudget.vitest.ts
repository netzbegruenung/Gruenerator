/**
 * Das Output-Budget der Artefakt-Lane ist load-bearing, nicht kosmetisch.
 *
 * Ein langes PDF oder ein 14-Folien-Deck geht in EINEM Tool-Call raus. Beim
 * 4096er-Default lief die Lane gemessen in 4 von 4 Läufen in
 * `finish_reason=length` — und ein abgeschnittener Tool-Call verliert ALLES:
 * `content` bleibt leer, der Text-Fallback in generateStructured hat nichts zu
 * greifen, also startet der Reparaturversuch und die Erstellung wird ein
 * zweites Mal bezahlt. Genau die Wartezeit, wegen der die Lane das Modell
 * gewechselt hat (ARTIFACT_MODEL in services/providers/providerSelector.ts).
 */
import { describe, it, expect } from 'vitest';

import { determineMaxTokens } from '../config.js';

describe('determineMaxTokens', () => {
  it('gives artifact generation room for a whole document', () => {
    expect(determineMaxTokens({ type: 'doc_generation' })).toBeGreaterThan(4096);
  });

  it('leaves the other lanes on the default', () => {
    expect(determineMaxTokens({ type: 'board_generation' })).toBe(4096);
    expect(determineMaxTokens({ type: 'sharepic_zitat' })).toBe(4096);
  });

  it('lets an explicit budget win', () => {
    expect(determineMaxTokens({ type: 'doc_generation', maxTokens: 500 })).toBe(500);
  });
});
