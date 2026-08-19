import { describe, it, expect } from 'vitest';

import { abortCause, isStreamFailure, phase1AbortError } from './responseStreamingService.js';

/**
 * Die Turn-Decke ist ein Timeout, kein Nutzer-Abbruch.
 *
 * Der Unterschied ist nicht kosmetisch. `'caller'` wirft absichtlich eine
 * nackte `AbortError`, die KEIN `StreamFailure` ist: sie fliegt an
 * `streamWithFallback` vorbei bis in den Router-Catch und erreicht den Client
 * als `code:'internal'`. Für einen Nutzer, der abgebrochen hat, ist das
 * richtig — niemand will die Antwort noch. Reichte man die Turn-Decke durch
 * dasselbe Feld, bekäme der Nutzer für eine gerissene Decke genau die stumme
 * Meldung, gegen die die Decke gebaut wurde (Review-Befund an PR #2712).
 */
const aborted = (): AbortSignal => AbortSignal.abort();
const live = (): AbortSignal => new AbortController().signal;

describe('Turn-Decke als Abbruchgrund', () => {
  it('ist ein eigener Grund, nicht "caller"', () => {
    expect(abortCause({ turnCeiling: aborted(), wall: live() })).toBe('turn_ceiling');
  });

  it('tritt hinter einen echten Nutzer-Abbruch zurück', () => {
    // Beide im selben Tick gefeuert: der Nutzer gewinnt, sonst bekäme ein
    // abgebrochener Zug einen Sibling-Versuch, den niemand mehr will.
    expect(abortCause({ caller: aborted(), turnCeiling: aborted(), wall: live() })).toBe('caller');
  });

  it('steht ÜBER dem Denk-Budget — das ist behebbar, die Decke nicht', () => {
    expect(abortCause({ turnCeiling: aborted(), reasoningBudget: aborted(), wall: live() })).toBe(
      'turn_ceiling'
    );
  });

  it('wird zu einem StreamFailure — geordneter Weg statt code:"internal"', () => {
    const err = phase1AbortError(
      'turn_ceiling',
      { wallClockMs: 180_000, turnCeilingMs: 360_000 },
      () => new Error('fallback')
    );
    expect(isStreamFailure(err)).toBe(true);
    expect(err.message).toContain('360000');
  });

  it('der Nutzer-Abbruch bleibt dagegen ausdrücklich KEIN StreamFailure', () => {
    const err = phase1AbortError('caller', { wallClockMs: 180_000 }, () => new Error('fallback'));
    expect(isStreamFailure(err)).toBe(false);
    expect(err.name).toBe('AbortError');
  });
});
