/**
 * Tests for normalizeMathDelimiters — backslash → dollar math delimiters,
 * and the ordering guarantee with escapeCitationMarkers.
 */

import { describe, expect, it } from 'vitest';

import { normalizeMathDelimiters, normalizeUnicodeMath } from './normalizeMathDelimiters';
import { escapeCitationMarkers } from './citationProcessing';

describe('normalizeMathDelimiters', () => {
  it('converts inline \\( … \\) to $ … $', () => {
    expect(normalizeMathDelimiters('Satz \\(a^2+b^2=c^2\\) Ende')).toBe('Satz $a^2+b^2=c^2$ Ende');
  });

  it('converts display \\[ … \\] to $$ … $$', () => {
    expect(normalizeMathDelimiters('\\[E = mc^2\\]')).toBe('$$E = mc^2$$');
  });

  it('handles multiline display math', () => {
    expect(normalizeMathDelimiters('\\[\na + b\n\\]')).toBe('$$\na + b\n$$');
  });

  it('leaves existing dollar math untouched', () => {
    expect(normalizeMathDelimiters('inline $x$ and block $$y$$')).toBe(
      'inline $x$ and block $$y$$'
    );
  });

  it('leaves bare citation markers untouched', () => {
    expect(normalizeMathDelimiters('Quelle [1] und [2]')).toBe('Quelle [1] und [2]');
  });

  it('preserves citations through the full preprocess pipeline (normalize → escape)', () => {
    // Citations must survive as escaped brackets; math must become dollars.
    const input = 'Formel \\(E=mc^2\\) laut Quelle [1]';
    const output = escapeCitationMarkers(normalizeMathDelimiters(input));
    expect(output).toBe('Formel $E=mc^2$ laut Quelle \\[1\\]');
  });
});

describe('normalizeUnicodeMath', () => {
  it('maps raw ≠ inside inline math to \\neq', () => {
    expect(normalizeUnicodeMath('Bedingung $a ≠ 0$ gilt')).toBe('Bedingung $a \\neq  0$ gilt');
  });

  it('maps operators inside display math', () => {
    expect(normalizeUnicodeMath('$$x ≤ y ≥ z$$')).toBe('$$x \\leq  y \\geq  z$$');
  });

  it('does NOT touch Unicode operators outside math spans', () => {
    expect(normalizeUnicodeMath('Vorzeichen ± und ≠ im Fließtext')).toBe(
      'Vorzeichen ± und ≠ im Fließtext'
    );
  });

  it('fuse-guards a command before a digit (≠0 → \\neq 0)', () => {
    expect(normalizeUnicodeMath('$a≠0$')).toBe('$a\\neq 0$');
  });

  it('composes after delimiter normalization: \\( a ≠ b \\) → $a \\neq b$', () => {
    const out = normalizeUnicodeMath(normalizeMathDelimiters('Es gilt \\(a ≠ b\\) hier'));
    expect(out).toBe('Es gilt $a \\neq  b$ hier');
  });
});
