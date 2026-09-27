/**
 * Der Verdikt-Parser der Hintergrund-Prüfung (#3221) — wie beim
 * Compute-Verifier ist der Parser exportiert und ohne Modell prüfbar.
 * Fail-open ist der Vertrag: alles Unlesbare wird zu {ok: true}.
 */
import { describe, it, expect } from 'vitest';

import { parseVerdict } from './runVerifier.js';

describe('parseVerdict', () => {
  it('liest ein sauberes ok-Verdikt', () => {
    expect(parseVerdict('{"ok": true}')).toEqual({ ok: true });
  });

  it('liest ein Beanstandungs-Verdikt mit Hinweis', () => {
    expect(parseVerdict('{"ok": false, "hint": "Thema verfehlt"}')).toEqual({
      ok: false,
      hint: 'Thema verfehlt',
    });
  });

  it('streift Code-Fences', () => {
    expect(parseVerdict('```json\n{"ok": false, "hint": "x"}\n```')).toEqual({
      ok: false,
      hint: 'x',
    });
  });

  it('lässt einen leeren Hinweis weg', () => {
    expect(parseVerdict('{"ok": false, "hint": ""}')).toEqual({ ok: false });
  });

  it('fail-open: Prosa, kaputtes JSON, falsche Form → ok', () => {
    expect(parseVerdict('Das Ergebnis sieht gut aus.')).toEqual({ ok: true });
    expect(parseVerdict('{"ok": "ja"}')).toEqual({ ok: true });
    expect(parseVerdict('{"plausible": false}')).toEqual({ ok: true });
    expect(parseVerdict('')).toEqual({ ok: true });
  });
});
