import { describe, expect, it } from 'vitest';

import { capComputeFiles, capFigures, MAX_FIGURES, parseComputeResult } from './computeResult';

describe('parseComputeResult', () => {
  it('parses labelled print lines into entries', () => {
    const r = parseComputeResult('Tabellen-Berechnung', 'Gesamtgewinn: 102199.508\n');
    expect(r.operation).toBe('Tabellen-Berechnung');
    expect(r.entries).toEqual([{ label: 'Gesamtgewinn', value: '102199.508' }]);
    expect(r.summary).toBe('Gesamtgewinn: 102199.508');
  });

  it('parses one entry per stdout line (groupby output)', () => {
    const r = parseComputeResult('Tabellen-Berechnung', 'Nord: 100.0\nSued: 200.0\n');
    expect(r.entries).toEqual([
      { label: 'Nord', value: '100.0' },
      { label: 'Sued', value: '200.0' },
    ]);
  });

  it('falls back to a generic entry for unlabelled output', () => {
    const r = parseComputeResult('Tabellen-Berechnung', '42\n');
    expect(r.entries).toEqual([{ label: 'Ergebnis', value: '42' }]);
  });

  it('collapses mostly-unlabelled multi-line output (pivot tables) into one entry', () => {
    // Beta: a printed pivot table produced a card row per line ("Ergebnis
    // Anna 17472…", 12 rows). Tabular output stays one block.
    const pivot = 'Umsatz pro Verkäufer:\nVerkäufer  Umsatz\nAnna  17472.58\nBen  65889.32\n';
    const r = parseComputeResult('Tabellen-Berechnung', pivot);
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0].label).toBe('Ergebnis');
    expect(r.entries[0].value).toContain('Ben  65889.32');
  });

  it('handles empty stdout without throwing', () => {
    const r = parseComputeResult('Tabellen-Berechnung', '   ');
    expect(r.entries).toEqual([{ label: 'Ergebnis', value: '' }]);
  });
});

describe('capFigures', () => {
  it('caps the figure count and drops oversized figures', () => {
    const small = 'a'.repeat(100);
    const oversized = 'b'.repeat(2_000_000);
    expect(capFigures([oversized, small, small, small, small])).toHaveLength(MAX_FIGURES);
    expect(capFigures([oversized])).toEqual([]);
    expect(capFigures([small])).toEqual([small]);
  });
});

describe('capComputeFiles', () => {
  it('caps count, drops oversized files and maps to the wire shape', () => {
    const small = { name: 'a.csv', base64: 'x'.repeat(100) };
    const big = { name: 'big.csv', base64: 'y'.repeat(2_500_000) };
    expect(
      capComputeFiles([big, small, { ...small, name: 'b.csv' }, { ...small, name: 'c.csv' }])
    ).toEqual([
      { name: 'a.csv', b64: 'x'.repeat(100) },
      { name: 'b.csv', b64: 'x'.repeat(100) },
    ]);
  });
});
