import { describe, it, expect } from 'vitest';

import {
  computeTextMetrics,
  evaluateArithmetic,
  computeArithmetic,
  computeUnitConvert,
  computeDateDiff,
  computeDateAdd,
} from './computeEngine.js';

const entry = (r: { entries: { label: string; value: string }[] }, label: string) =>
  r.entries.find((e) => e.label === label)?.value;

describe('computeTextMetrics', () => {
  // Regression: the exact "Wandrers Nachtlied" block that the LLM mis-counted
  // as 195/201 — the bug that motivated this whole feature. Ground truth
  // (Zeichenzaehlen.de): 206 chars incl. spaces+breaks, 57 vowels.
  const poem = `Wandrers Nachtlied II – Johann Wolfgang von Goethe

Über allen Gipfen
ist Ruh',
und unten leuchtet
der Mond in voller Pracht.

Die Sterne flüstern
leise Lieder,
die Welt schläft still,
nur das Herz erwacht.`;

  it('counts the poem exactly like a reference counter', () => {
    const r = computeTextMetrics(poem);
    expect(entry(r, 'Zeichen (inkl. Leerzeichen)')).toBe('206');
    expect(entry(r, 'Vokale')).toBe('57');
  });

  it('counts code points, not UTF-16 units (umlauts count once)', () => {
    const r = computeTextMetrics('über');
    expect(entry(r, 'Zeichen (inkl. Leerzeichen)')).toBe('4');
  });

  it('handles empty text', () => {
    const r = computeTextMetrics('');
    expect(entry(r, 'Wörter (durch Leerzeichen getrennt)')).toBe('0');
    expect(entry(r, 'Zeilen')).toBe('0');
  });

  it('separates chars with and without whitespace', () => {
    const r = computeTextMetrics('a b\nc');
    expect(entry(r, 'Zeichen (inkl. Leerzeichen)')).toBe('5');
    expect(entry(r, 'Zeichen (ohne Zeilenumbrüche)')).toBe('4');
    expect(entry(r, 'Zeichen (ohne Leerzeichen)')).toBe('3');
  });
});

describe('evaluateArithmetic', () => {
  it('evaluates precedence and parentheses', () => {
    expect(evaluateArithmetic('2 + 3 * 4')).toBe(14);
    expect(evaluateArithmetic('(2 + 3) * 4')).toBe(20);
  });
  it('handles percentages once normalised to a plain expression', () => {
    expect(evaluateArithmetic('0.2 * 340')).toBe(68);
  });
  it('handles powers and unary minus', () => {
    expect(evaluateArithmetic('-2 ^ 2')).toBe(-4); // unary binds looser than ^
    expect(evaluateArithmetic('2 ^ 3')).toBe(8);
  });
  it('rejects stray characters and code injection', () => {
    expect(evaluateArithmetic('2 + foo')).toBeNull();
    expect(evaluateArithmetic('process.exit(1)')).toBeNull();
    expect(evaluateArithmetic('1/0')).toBeNull();
    expect(evaluateArithmetic('')).toBeNull();
  });
  it('formats German output', () => {
    expect(computeArithmetic('1000 * 1000')?.summary).toContain('1.000.000');
  });
});

describe('computeUnitConvert', () => {
  it('converts length', () => {
    expect(computeUnitConvert(5, 'km', 'mi')?.summary).toContain('3,106856');
  });
  it('converts temperature (affine)', () => {
    expect(computeUnitConvert(100, 'C', 'F')?.summary).toContain('212');
    expect(computeUnitConvert(32, 'F', 'C')?.summary).toContain('0');
  });
  it('rejects cross-dimension conversion', () => {
    expect(computeUnitConvert(5, 'km', 'kg')).toBeNull();
  });
});

describe('date math', () => {
  it('computes day differences', () => {
    expect(computeDateDiff('2026-01-01', '2026-12-25')?.summary).toContain('358 Tage');
  });
  it('rejects invalid dates', () => {
    expect(computeDateDiff('2026-02-31', '2026-03-01')).toBeNull();
    expect(computeDateDiff('nope', '2026-01-01')).toBeNull();
  });
  it('adds days across a month boundary', () => {
    expect(computeDateAdd('2026-01-30', 5, 'days')?.summary).toContain('04.02.2026');
  });
  it('adds years', () => {
    expect(computeDateAdd('2026-07-01', 2, 'years')?.summary).toContain('01.07.2028');
  });
});
