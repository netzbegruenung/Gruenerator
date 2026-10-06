import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetModelHealthForTests, recordSlowVerdict } from './modelHealth.js';
import { pickHealthyTarget, resolveAlternative } from './modelSiblings.js';

const configured = new Set(['cortecs', 'mistral', 'melious']);

/** Mutabel, weil Melious' Standard aus der Umgebung kommt
 *  (`MELIOUS_DEFAULT_MODEL`, siehe providers.ts) — genau der Grund, warum das
 *  Veto weiter unten noch gebraucht wird, obwohl kein Denkmodell mehr fest in
 *  der Kette steht. */
const defaults: Record<string, string> = {
  cortecs: 'gemma-4-31b-it',
  melious: 'gemma-4-31b:balanced',
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
    for (const p of ['cortecs', 'mistral', 'melious']) configured.add(p);
    defaults.cortecs = 'gemma-4-31b-it';
    defaults.melious = 'gemma-4-31b:balanced';
    defaults.mistral = 'mistral-medium-2604';
  });

  it('ohne Vermerk bleibt alles, wie es war', () => {
    expect(pickHealthyTarget('melious', 'gemma-4-31b:balanced')).toBeNull();
  });

  it('das belegte Geschwister geht vor der Fallback-Kette', () => {
    markSlow('melious', 'gemma-4-31b:balanced');
    expect(pickHealthyTarget('melious', 'gemma-4-31b:balanced')).toEqual({
      provider: 'cortecs',
      model: 'gemma-4-31b-it',
    });
  });

  it('ist das Geschwister selbst zäh, greift die Kette', () => {
    markSlow('melious', 'gemma-4-31b:balanced');
    markSlow('cortecs', 'gemma-4-31b-it');
    expect(pickHealthyTarget('melious', 'gemma-4-31b:balanced')).toEqual({
      provider: 'mistral',
      model: 'mistral-medium-2604',
    });
  });

  /**
   * „Panda" weicht nie auf ein beliebiges Kettenmodell aus: solange GreenPTs
   * DeepSeek-Standort ungeklärt ist (`GREENPT_DEEPSEEK_CLEARED`), ist Ultra
   * das Geschwister.
   */
  it('ein zäher DeepSeek-Primär geht an Ultra, nicht an GreenPT', () => {
    configured.add('greenpt');
    markSlow('melious', 'deepseek-v4.1-flash');
    expect(pickHealthyTarget('melious', 'deepseek-v4.1-flash')).toEqual({
      provider: 'mistral',
      model: 'mistral-large-4',
    });
  });

  it('ein nicht konfigurierter Anbieter wird übersprungen', () => {
    configured.delete('cortecs');
    markSlow('melious', 'gemma-4-31b:balanced');
    expect(pickHealthyTarget('melious', 'gemma-4-31b:balanced')).toEqual({
      provider: 'mistral',
      model: 'mistral-medium-2604',
    });
  });

  it('ist alles zäh, bleibt es beim Primär — langsam schlägt gar nicht', () => {
    markSlow('melious', 'gemma-4-31b:balanced');
    markSlow('cortecs', 'gemma-4-31b-it');
    markSlow('mistral', 'mistral-medium-2604');
    expect(pickHealthyTarget('melious', 'gemma-4-31b:balanced')).toBeNull();
  });

  it('für ein Modell ohne Geschwister liefert die Kette den nächsten Anbieter', () => {
    markSlow('greenpt', 'gemma4');
    expect(resolveAlternative('greenpt', 'gemma4')).toEqual({
      provider: 'cortecs',
      model: 'gemma-4-31b-it',
    });
  });

  /**
   * Der Ausweichfall, der am 19.08.2026 auf ein Verbots-Modell zeigte.
   *
   * Damals war es `litellm/verdigado-pro` = `gpt-oss:120b-ctx128k`, das erste
   * Glied der Kette. Der Host ist seit dem 29.08.2026 stillgelegt
   * (./litellmRetired.ts), das Veto bleibt trotzdem nötig: der Standard eines
   * Kettenanbieters kommt aus dessen Umgebungsvariable (`MELIOUS_DEFAULT_MODEL`), und Melious serviert gpt-oss unter eigenem
   * Namen. Die Tests stellen genau das ein — Vermerk statt echter Störung.
   */
  describe('Veto des Aufrufers gegen ein Ausweichziel', () => {
    /** Dieselbe Frage, die `mayWriteAnswer` in autoPolicy.ts stellt. */
    const mayWriteAnswer = (t: { model: string }): boolean =>
      !/verdigado-think|verdigado-pro|qwen|gpt-oss/i.test(t.model);

    it('überspringt das Verbots-Modell und nimmt das nächste erlaubte', () => {
      defaults.melious = 'gpt-oss-120b';
      markSlow('cortecs', 'gemma-4-31b-it');
      // Das Geschwister trägt ein Literal aus gemmaHosts.ts, keinen
      // Umgebungsstandard — es überlebt das Veto und geht der Kette vor.
      expect(resolveAlternative('cortecs', 'gemma-4-31b-it', mayWriteAnswer)).toEqual({
        provider: 'melious',
        model: 'gemma-4-31b:balanced',
      });
    });

    it('bleibt beim Primär, wenn jedes Ausweichziel verboten ist', () => {
      configured.clear();
      configured.add('cortecs');
      configured.add('melious');
      defaults.melious = 'gpt-oss-120b';
      markSlow('cortecs', 'gemma-4-31b-it');
      // Auch das Geschwister-Literal zäh, damit die Kette greift: übrig bliebe
      // nur melious/gpt-oss-120b — das Veto lehnt es ab.
      markSlow('melious', 'gemma-4-31b:balanced');
      expect(pickHealthyTarget('cortecs', 'gemma-4-31b-it', mayWriteAnswer)).toBeNull();
      // Gegenprobe: OHNE Veto ist es genau das, was die Kette zurückgibt.
      expect(pickHealthyTarget('cortecs', 'gemma-4-31b-it')).toEqual({
        provider: 'melious',
        model: 'gpt-oss-120b',
      });
    });
  });
});
