import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetModelHealthForTests, recordSlowVerdict } from './modelHealth.js';
import { pickHealthyTarget, resolveAlternative } from './modelSiblings.js';

const configured = new Set(['regolo', 'cortecs', 'mistral']);

/** Mutabel, weil Regolos Standard aus der Umgebung kommt (`REGOLO_DEFAULT_MODEL`,
 *  siehe textModelPolicy.ts) — genau der Grund, warum das Veto weiter unten
 *  noch gebraucht wird, obwohl kein Denkmodell mehr fest in der Kette steht. */
const defaults: Record<string, string> = {
  cortecs: 'gemma-4-31b-it',
  regolo: 'gemma4-31b',
  mistral: 'mistral-medium-2604',
};

vi.mock('./providers.js', () => ({
  isProviderConfigured: (p: string) => configured.has(p),
  getDefaultModel: (p: string) => defaults[p] ?? 'x',
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
    for (const p of ['regolo', 'cortecs', 'mistral']) configured.add(p);
    defaults.cortecs = 'gemma-4-31b-it';
    defaults.regolo = 'gemma4-31b';
    defaults.mistral = 'mistral-medium-2604';
  });

  it('ohne Vermerk bleibt alles, wie es war', () => {
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toBeNull();
  });

  it('das belegte Geschwister geht vor der Fallback-Kette', () => {
    markSlow('regolo', 'gemma4-31b');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toEqual({
      provider: 'cortecs',
      model: 'gemma-4-31b-it',
    });
  });

  it('ist das Geschwister selbst zäh, greift die Kette', () => {
    markSlow('regolo', 'gemma4-31b');
    markSlow('cortecs', 'gemma-4-31b-it');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toEqual({
      provider: 'mistral',
      model: 'mistral-medium-2604',
    });
  });

  it('ein nicht konfigurierter Anbieter wird übersprungen', () => {
    configured.delete('cortecs');
    markSlow('regolo', 'gemma4-31b');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toEqual({
      provider: 'mistral',
      model: 'mistral-medium-2604',
    });
  });

  it('ist alles zäh, bleibt es beim Primär — langsam schlägt gar nicht', () => {
    markSlow('regolo', 'gemma4-31b');
    markSlow('cortecs', 'gemma-4-31b-it');
    markSlow('mistral', 'mistral-medium-2604');
    expect(pickHealthyTarget('regolo', 'gemma4-31b')).toBeNull();
  });

  it('für ein Modell ohne Geschwister liefert die Kette den nächsten Anbieter', () => {
    markSlow('regolo', 'mistral-small-4-119b');
    expect(resolveAlternative('regolo', 'mistral-small-4-119b')).toEqual({
      provider: 'cortecs',
      model: 'gemma-4-31b-it',
    });
  });

  /**
   * Der Ausweichfall, der am 19.08.2026 auf ein Verbots-Modell zeigte.
   *
   * Damals war es `litellm/verdigado-pro` = `gpt-oss:120b-ctx128k`, das erste
   * Glied der Kette. Der Host ist seit dem 29.08.2026 stillgelegt
   * (./litellmRetired.ts), das Veto bleibt trotzdem nötig: Regolos Standard
   * kommt aus `REGOLO_DEFAULT_MODEL`, und Regolo serviert gpt-oss-120b unter
   * eigenem Namen. Die Tests stellen genau das ein — Vermerk statt echter
   * Störung.
   */
  describe('Veto des Aufrufers gegen ein Ausweichziel', () => {
    /** Dieselbe Frage, die `mayWriteAnswer` in autoPolicy.ts stellt. */
    const mayWriteAnswer = (t: { model: string }): boolean =>
      !/verdigado-think|verdigado-pro|qwen|gpt-oss/i.test(t.model);

    it('überspringt das Verbots-Modell und nimmt das nächste erlaubte', () => {
      defaults.cortecs = 'gpt-oss-120b';
      markSlow('cortecs', 'gemma-4-31b-it');
      expect(resolveAlternative('cortecs', 'gemma-4-31b-it', mayWriteAnswer)).toEqual({
        provider: 'regolo',
        model: 'gemma4-31b',
      });
    });

    it('bleibt beim Primär, wenn jedes Ausweichziel verboten ist', () => {
      configured.clear();
      configured.add('regolo');
      configured.add('cortecs');
      defaults.regolo = 'gpt-oss-120b';
      markSlow('cortecs', 'gemma-4-31b-it');
      markSlow('regolo', 'gemma4-31b');
      // Übrig bliebe nur regolo/gpt-oss-120b — das Veto lehnt es ab.
      expect(pickHealthyTarget('cortecs', 'gemma-4-31b-it', mayWriteAnswer)).toBeNull();
      // Gegenprobe: OHNE Veto ist es genau das, was die Kette zurückgibt.
      expect(pickHealthyTarget('cortecs', 'gemma-4-31b-it')).toEqual({
        provider: 'regolo',
        model: 'gpt-oss-120b',
      });
    });
  });
});
