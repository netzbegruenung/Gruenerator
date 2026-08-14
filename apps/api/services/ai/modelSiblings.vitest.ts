import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetModelHealthForTests, recordSlowVerdict } from './modelHealth.js';
import { pickHealthyTarget, resolveAlternative } from './modelSiblings.js';

const configured = new Set(['regolo', 'scaleway', 'litellm', 'mistral']);

vi.mock('./providers.js', () => ({
  isProviderConfigured: (p: string) => configured.has(p),
  getDefaultModel: (p: string) =>
    ({ litellm: 'verdigado-pro', regolo: 'gemma4-31b', mistral: 'mistral-medium-2604' })[p] ?? 'x',
}));

/** Zwei Verdikte = vermerkt. */
function markSlow(provider: string, model: string): void {
  recordSlowVerdict(provider, model, 'test');
  recordSlowVerdict(provider, model, 'test');
}

describe('modelSiblings', () => {
  beforeEach(() => {
    _resetModelHealthForTests();
    configured.clear();
    for (const p of ['regolo', 'scaleway', 'litellm', 'mistral']) configured.add(p);
  });

  it('ohne Vermerk bleibt alles, wie es war', () => {
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toBeNull();
  });

  it('das belegte Geschwister geht vor der Fallback-Kette', () => {
    markSlow('regolo', 'gemma4-31b');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toEqual({
      provider: 'scaleway',
      model: 'gemma-4-26b-a4b-it',
    });
  });

  it('ist das Geschwister selbst zäh, greift die Kette', () => {
    markSlow('regolo', 'gemma4-31b');
    markSlow('scaleway', 'gemma-4-26b-a4b-it');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toEqual({
      provider: 'litellm',
      model: 'verdigado-pro',
    });
  });

  it('ein nicht konfigurierter Anbieter wird übersprungen', () => {
    configured.delete('scaleway');
    configured.delete('litellm');
    markSlow('regolo', 'gemma4-31b');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toEqual({
      provider: 'mistral',
      model: 'mistral-medium-2604',
    });
  });

  it('ist alles zäh, bleibt es beim Primär — langsam schlägt gar nicht', () => {
    markSlow('regolo', 'gemma4-31b');
    markSlow('scaleway', 'gemma-4-26b-a4b-it');
    markSlow('litellm', 'verdigado-pro');
    markSlow('mistral', 'mistral-medium-2604');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toBeNull();
  });

  it('für ein Modell ohne Geschwister liefert die Kette den nächsten Anbieter', () => {
    markSlow('regolo', 'mistral-small-4-119b');
    expect(resolveAlternative('regolo', 'mistral-small-4-119b')).toEqual({
      provider: 'litellm',
      model: 'verdigado-pro',
    });
  });
});
