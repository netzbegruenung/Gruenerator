/**
 * Drift-Guard für die Text-Modell-Sperre.
 *
 * Der Punkt dieser Datei ist nicht, `isExcludedTextModel` zu testen — das ist
 * ein Regex. Der Punkt ist die ZWEITE Hälfte: dass Bild und Rerank NICHT
 * mitgenommen werden, und dass kein Provider-Default und keine Lane still auf
 * ein gesperrtes Modell zurückfällt. Beides war der eigentliche Fehler, den
 * dieser PR behebt (die Fallback-Kette landete auf Qwen, ohne dass es jemand
 * gewählt hatte).
 */

import { describe, it, expect } from 'vitest';

import { AI_LANES } from '../lanes.js';
import { getDefaultModel } from '../providers.js';
import { isExcludedTextModel, regoloTextDefault, REGOLO_TEXT_DEFAULT } from '../textModelPolicy.js';

import type { ProviderName } from '../providers.js';

describe('Text-Modell-Sperre', () => {
  it('erkennt die gesperrten Familien', () => {
    for (const m of [
      'qwen3.5-122b',
      'qwen3.6-27b',
      'qwen3.5-9b',
      'glm-5.2',
      'kimi-k2.6',
      'minimax-m2.5',
      'deepseek-r1-distill-llama-70b',
    ]) {
      expect(isExcludedTextModel(m), m).toBe(true);
    }
  });

  it('lässt die europäischen Modelle in Ruhe', () => {
    for (const m of [
      'gemma4-31b',
      'mistral-medium-2604',
      'mistral-small-4-119b',
      'mistral-small-3.2-24b-instruct-2506',
      'verdigado-pro',
      'verdigado-think',
      'gpt-oss-120b',
      'pixtral-large-latest',
    ]) {
      expect(isExcludedTextModel(m), m).toBe(false);
    }
  });
});

describe('kein Default fällt still auf ein gesperrtes Modell', () => {
  const PROVIDERS: ProviderName[] = ['mistral', 'litellm', 'regolo', 'greenpt'];

  // Das ist der Fall, der live war: providerFallback.getFallbackModelForProvider
  // gibt genau dieses `getDefaultModel` zurück, und die Kette endet auf regolo.
  it.each(PROVIDERS)('getDefaultModel("%s") ist kein gesperrtes Modell', (provider) => {
    expect(isExcludedTextModel(getDefaultModel(provider))).toBe(false);
  });

  it.each(Object.entries(AI_LANES))('Lane "%s" nennt kein gesperrtes Modell', (_id, config) => {
    if (config.model === null) return; // Provider-Default, oben schon geprüft
    expect(isExcludedTextModel(config.model)).toBe(false);
  });

  it('verwirft einen gesperrten REGOLO_DEFAULT_MODEL statt ihn zu übernehmen', () => {
    expect(regoloTextDefault({ REGOLO_DEFAULT_MODEL: 'qwen3.5-122b' })).toBe(REGOLO_TEXT_DEFAULT);
  });

  it('übernimmt einen zulässigen REGOLO_DEFAULT_MODEL', () => {
    expect(regoloTextDefault({ REGOLO_DEFAULT_MODEL: 'gemma4-31b' })).toBe('gemma4-31b');
  });

  it('liefert ohne Env-Wert den benannten Standard, nie einen leeren Namen', () => {
    expect(regoloTextDefault({})).toBe(REGOLO_TEXT_DEFAULT);
    expect(regoloTextDefault({})).not.toBe('');
  });
});

describe('Bild und Rerank sind ausdrücklich NICHT betroffen', () => {
  /**
   * Diese beiden laufen über eigene Services (`RegoloImageService`,
   * `RegoloRerankService`) und nie über `getModel`, sind von der Sperre also
   * unberührt — dass der Regex sie MATCHT, ist genau der Grund, warum das hier
   * festgehalten wird: wer die Sperre irgendwann breiter anwendet, muss diese
   * beiden Pfade ausnehmen, sonst fallen ein UI-Modell und das Reranking aus.
   */
  it('würde vom Regex erfasst — Aufrufpfade müssen getrennt bleiben', () => {
    expect(isExcludedTextModel('Qwen-Image')).toBe(true);
    expect(isExcludedTextModel('Qwen3-Reranker-4B')).toBe(true);
  });
});
