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

  /**
   * Der Ausweichfall, der am 19.08.2026 auf ein Verbots-Modell zeigte.
   *
   * `litellm/verdigado-pro` ist am Proxy `gpt-oss:120b-ctx128k` — das Modell,
   * das `AVOID_AS_SYNTH` für antwortschreibende Slots ausschliesst. Die Kette
   * hat diese Entscheidung nie gelesen: sie fiel eine Ebene höher. Die Tests
   * simulieren den Ausfall (Vermerk statt echter Störung), wie der Auftrag es
   * verlangt.
   */
  describe('Veto des Aufrufers gegen ein Ausweichziel', () => {
    /** Dieselbe Frage, die `mayWriteAnswer` in autoPolicy.ts stellt. */
    const mayWriteAnswer = (t: { model: string }): boolean =>
      !/verdigado-think|verdigado-pro|qwen|gpt-oss/i.test(t.model);

    it('überspringt das Verbots-Modell und nimmt das nächste erlaubte', () => {
      markSlow('regolo', 'mistral-small-4-119b');
      expect(resolveAlternative('regolo', 'mistral-small-4-119b', mayWriteAnswer)).toEqual({
        provider: 'mistral',
        model: 'mistral-medium-2604',
      });
    });

    it('greift auch am belegten Geschwister vorbei', () => {
      markSlow('litellm', 'verdigado-pro');
      // Ohne Veto wäre `litellm` das erste Kettenglied für ein zähes Mistral.
      markSlow('mistral', 'mistral-medium-2604');
      configured.delete('regolo');
      configured.delete('scaleway');
      expect(pickHealthyTarget('mistral', 'mistral-medium-2604', mayWriteAnswer)).toBeNull();
    });

    it('bleibt beim Primär, wenn jedes Ausweichziel verboten ist', () => {
      configured.clear();
      configured.add('litellm');
      configured.add('regolo');
      markSlow('regolo', 'gemma4-31b');
      markSlow('scaleway', 'gemma-4-26b-a4b-it');
      // Übrig bliebe nur litellm/verdigado-pro — das Veto lehnt es ab.
      expect(pickHealthyTarget('regolo', 'gemma4-31b', mayWriteAnswer)).toBeNull();
      // Gegenprobe: OHNE Veto ist es genau das, was die Kette zurückgibt.
      expect(pickHealthyTarget('regolo', 'gemma4-31b')).toEqual({
        provider: 'litellm',
        model: 'verdigado-pro',
      });
    });
  });
});
