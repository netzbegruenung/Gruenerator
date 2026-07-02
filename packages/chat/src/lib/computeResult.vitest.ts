import { describe, expect, it } from 'vitest';

import { parseComputeResult } from './computeResult';

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

  it('handles empty stdout without throwing', () => {
    const r = parseComputeResult('Tabellen-Berechnung', '   ');
    expect(r.entries).toEqual([{ label: 'Ergebnis', value: '' }]);
  });
});
