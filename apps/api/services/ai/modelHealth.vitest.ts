import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetModelHealthForTests,
  isModelSlow,
  modelHealthSnapshot,
  primeBaseline,
  recordModelSample,
  recordSlowVerdict,
} from './modelHealth.js';

const P = 'regolo';
const M = 'gemma4-31b';

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
