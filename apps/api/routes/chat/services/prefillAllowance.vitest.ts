/**
 * Der Zuschlag fürs Einlesen gegen die Messpunkte, aus denen er stammt.
 *
 * Gemessen 22.10.2026 (siehe prefillAllowance.ts): Ein Zuschlag, der unter
 * einem dieser Punkte läge, liesse die 20-s-Frist genau dort reissen, wo sie es
 * vorher tat — ein Zug, den der Anbieter sauber beantwortet, ginge an die
 * kleinere Ausweich-Lane.
 */
import { describe, expect, it } from 'vitest';

import { prefillAllowanceForModel, prefillAllowanceMs, promptChars } from './prefillAllowance.js';

/** Zeichen, die Mistrals Tokenizer an deutscher Doku-Prosa zu einem Token macht. */
const MISTRAL_CHARS_PER_TOKEN = 4.1;
const MELIOUS_CHARS_PER_TOKEN = 3.5;

describe('prefillAllowanceMs', () => {
  it.each([
    // [Prompt-Tokens, gemessene Sekunden bis zum ersten Delta]
    [97_493, 22.2],
    [191_011, 45.7],
    [861_094, 111.2],
  ])('deckt Mistral bei %i Tokens (gemessen %f s)', (tokens, seconds) => {
    const allowance = prefillAllowanceMs('mistral', tokens * MISTRAL_CHARS_PER_TOKEN);
    expect(allowance).toBeGreaterThanOrEqual(seconds * 1000);
  });

  it.each([
    [114_507, 6.1],
    [884_661, 52.9],
  ])('deckt Melious bei %i Tokens (gemessen %f s)', (tokens, seconds) => {
    const allowance = prefillAllowanceMs('melious', tokens * MELIOUS_CHARS_PER_TOKEN);
    expect(allowance).toBeGreaterThanOrEqual(seconds * 1000);
  });

  it('liest den AI-SDK-Namen des Anbieters wie den der Lane-Tabelle', () => {
    expect(prefillAllowanceMs('mistral.chat', 350_000)).toBe(
      prefillAllowanceMs('mistral', 350_000)
    );
  });

  it('lässt einen gewöhnlichen Zug unberührt — die Grundfrist deckt ihn', () => {
    expect(prefillAllowanceMs('mistral', 20_000 * 3.5)).toBe(0);
    expect(prefillAllowanceMs('mistral', 500)).toBe(0);
  });

  it('gibt ungemessenen Anbietern keinen Zuschlag — ihre Fristen bleiben, wie sie waren', () => {
    expect(prefillAllowanceMs('cortecs', 3_000_000)).toBe(0);
    expect(prefillAllowanceMs('greenpt', 3_000_000)).toBe(0);
  });
});

describe('promptChars', () => {
  it('zählt System-Prompt, Text und Text-Teile, aber keine Bilder', () => {
    expect(
      promptChars('abc', [
        { content: 'hallo' },
        {
          content: [
            { type: 'text', text: 'welt' },
            { type: 'image', image: 'data:image/png;base64,AAAA' },
          ],
        },
      ])
    ).toBe(3 + 5 + 4);
  });
});

describe('prefillAllowanceForModel', () => {
  it('nimmt den Anbieter vom Modell-Objekt und toleriert eine Attrappe ohne', () => {
    const messages = [{ role: 'user' as const, content: 'x'.repeat(350_000) }];
    const mistral = { provider: 'mistral.chat', modelId: 'mistral-large-4' } as never;
    expect(prefillAllowanceForModel(mistral, null, messages)).toBeGreaterThan(0);
    expect(prefillAllowanceForModel({} as never, null, messages)).toBe(0);
  });
});
