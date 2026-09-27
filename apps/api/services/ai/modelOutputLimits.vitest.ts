import { describe, it, expect } from 'vitest';

import { getMaxOutputTokens } from './modelOutputLimits.js';

describe('getMaxOutputTokens', () => {
  // Andere Achse als das Kontextfenster: Medium 3.5 nimmt 262k Eingabe an und
  // deckelt die Ausgabe bei 16.384. Gemessen 13.08.2026 an einem 400er von
  // Scaleway ("max_completion_tokens is limited to 16384"); die Mistral-API
  // deckelt dieselben Gewichte gleich, ein Replay dorthin hilft also nicht.
  it('kennt die Decke von Mistral Medium 3.5 unter beiden Upstream-Namen', () => {
    expect(getMaxOutputTokens('mistral-medium-2604')).toBe(16_384);
    expect(getMaxOutputTokens('mistral-medium-3.5-128b')).toBe(16_384);
  });

  it('gibt für ein Modell ohne bekannte Decke null zurück — der Anbieter entscheidet', () => {
    expect(getMaxOutputTokens('gpt-oss-120b')).toBeNull();
    expect(getMaxOutputTokens('gemma4-31b')).toBeNull();
    expect(getMaxOutputTokens(null)).toBeNull();
    expect(getMaxOutputTokens(undefined)).toBeNull();
  });

  // Die Decke hängt an den GEWICHTEN, nicht an der Lane: nachgeschlagen wird
  // der Modellname des Upstreams, nicht die nutzerseitige Lane-ID.
  it('nimmt den Modellnamen, nicht die Lane-ID', () => {
    expect(getMaxOutputTokens('mistral-medium-3.5')).toBeNull();
    expect(getMaxOutputTokens('gruenerator-ultra')).toBeNull();
  });
});
