import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetModelHealthForTests,
  isModelSlow,
  modelHealthSnapshot,
  primeBaseline,
  recordModelSample,
  recordSlowVerdict,
} from './modelHealth.js';

const P = 'cortecs';
const M = 'gemma-4-31b-it';

/** Eine Antwort mit `tokens` Ausgabe-Tokens bei `rate` tok/s. */
function sample(rate: number, tokens = 200): void {
  recordModelSample({
    provider: P,
    model: M,
    outputTokens: tokens,
    durationMs: (tokens / rate) * 1000,
  });
}

/** Eine Basislinie von ~80 tok/s einfahren. */
function warmUp(): void {
  for (let i = 0; i < 12; i++) sample(80);
}

describe('modelHealth', () => {
  beforeEach(() => {
    _resetModelHealthForTests();
    vi.useRealTimers();
  });

  it('urteilt nicht, solange die Basislinie zu dünn ist', () => {
    for (let i = 0; i < 5; i++) sample(2);
    expect(isModelSlow(P, M)).toBe(false);
  });

  it('vermerkt nach zwei zähen Proben', () => {
    warmUp();
    sample(3.7);
    expect(isModelSlow(P, M)).toBe(false);
    sample(3.9);
    expect(isModelSlow(P, M)).toBe(true);
  });

  it('eine gesunde Probe dazwischen setzt den Zähler zurück', () => {
    warmUp();
    sample(3.7);
    sample(75);
    sample(3.9);
    expect(isModelSlow(P, M)).toBe(false);
  });

  it('die Basislinie wird während der Störung nicht vergiftet', () => {
    warmUp();
    const vorher = modelHealthSnapshot()[0]?.baseline ?? 0;
    for (let i = 0; i < 20; i++) sample(3.7);
    const nachher = modelHealthSnapshot()[0]?.baseline ?? 0;
    expect(nachher).toBeCloseTo(vorher, 5);
    expect(isModelSlow(P, M)).toBe(true);
  });

  it('kurze Antworten werden gezählt, aber nicht beurteilt', () => {
    warmUp();
    // Zwei Auflöser-Antworten: 8 Tokens in 400 ms sind 20 tok/s und lägen unter
    // der Schwelle — sie messen aber die Anlaufzeit, nicht den Durchsatz.
    recordModelSample({ provider: P, model: M, outputTokens: 8, durationMs: 400 });
    recordModelSample({ provider: P, model: M, outputTokens: 8, durationMs: 400 });
    expect(isModelSlow(P, M)).toBe(false);
    expect(modelHealthSnapshot()[0]?.samples).toBe(14);
  });

  it('Antworten auf lange Prompts beurteilen den Durchsatz nicht (Prefill)', () => {
    // 28.10.2026: ein Bundestag-Lesefenster mit ~60k Prompt-Tokens rechnete die
    // Prefill-Zeit in die Rate (5,9 statt ~31 tok/s) und leitete fünf Minuten
    // lang JEDE Gemma-Lane auf den Sibling um.
    warmUp();
    for (let i = 0; i < 3; i++) {
      recordModelSample({
        provider: P,
        model: M,
        outputTokens: 400,
        durationMs: (400 / 5.9) * 1000,
        inputTokens: 60_000,
      });
    }
    expect(isModelSlow(P, M)).toBe(false);
    expect(modelHealthSnapshot()[0]?.samples).toBe(15);
    expect(modelHealthSnapshot()[0]?.p50TokensPerSec).toBe(80);
  });

  it('Prefill-lastige Proben unter der Längenschwelle beurteilen den Durchsatz nicht', () => {
    // 28k Prompt, 282 Ausgabe-Tokens (~99×): unter Last 9 tok/s, das Modell war gesund.
    warmUp();
    for (let i = 0; i < 3; i++) {
      recordModelSample({
        provider: P,
        model: M,
        outputTokens: 282,
        durationMs: (282 / 9) * 1000,
        inputTokens: 28_000,
      });
    }
    expect(isModelSlow(P, M)).toBe(false);
  });

  it('zähe Proben mit normal langem Prompt vermerken weiterhin', () => {
    warmUp();
    for (let i = 0; i < 2; i++) {
      recordModelSample({
        provider: P,
        model: M,
        outputTokens: 200,
        durationMs: (200 / 3.7) * 1000,
        inputTokens: 4_000,
      });
    }
    expect(isModelSlow(P, M)).toBe(true);
  });

  it('ein ausdrückliches Verdikt zählt wie eine zähe Probe', () => {
    recordSlowVerdict(P, M, 'First-Token-Frist gerissen');
    expect(isModelSlow(P, M)).toBe(false);
    recordSlowVerdict(P, M, 'First-Token-Frist gerissen');
    expect(isModelSlow(P, M)).toBe(true);
  });

  it('nach 5 min steht das Paar auf Probe — ein Verdikt genügt', () => {
    vi.useFakeTimers();
    recordSlowVerdict(P, M, 'x');
    recordSlowVerdict(P, M, 'x');
    expect(isModelSlow(P, M)).toBe(true);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(isModelSlow(P, M)).toBe(false);

    recordSlowVerdict(P, M, 'wieder zäh');
    expect(isModelSlow(P, M)).toBe(true);
  });

  it('eine gesunde Probe auf Probe beendet die Probezeit', () => {
    vi.useFakeTimers();
    warmUp();
    sample(3.7);
    sample(3.9);
    expect(isModelSlow(P, M)).toBe(true);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(isModelSlow(P, M)).toBe(false);

    sample(78);
    sample(3.7);
    expect(isModelSlow(P, M)).toBe(false);
  });

  it('primeBaseline wärmt vor, überschreibt aber nichts Gelerntes', () => {
    primeBaseline(P, M, 76);
    sample(3.7);
    sample(3.9);
    expect(isModelSlow(P, M)).toBe(true);

    _resetModelHealthForTests();
    warmUp();
    primeBaseline(P, M, 1);
    expect(modelHealthSnapshot()[0]?.baseline).toBeGreaterThan(70);
  });

  it('der Schnappschuss liefert p50 und leert die Zähler bei drain', () => {
    warmUp();
    recordModelSample({ provider: P, model: M, outputTokens: 200, durationMs: 2500, ttftMs: 400 });

    const [row] = modelHealthSnapshot({ drain: true });
    expect(row?.provider).toBe(P);
    expect(row?.samples).toBe(13);
    expect(row?.p50TokensPerSec).toBeGreaterThan(0);
    expect(row?.p50TtftMs).toBe(400);

    expect(modelHealthSnapshot()).toEqual([]);
  });
});
