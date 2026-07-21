import { describe, expect, it } from 'vitest';

import { buildChartData } from './buildChartData.js';

describe('buildChartData', () => {
  const grid = [
    ['Quartal', 'Umsatz', 'Kosten'],
    ['Q1', 1000, 400],
    ['Q2', 1500, 500],
  ];

  it('uses row 0 as headers and column 0 as category', () => {
    const c = buildChartData(grid, 'bar', 'Finanzen');
    expect(c.chartType).toBe('bar');
    expect(c.title).toBe('Finanzen');
    expect(c.categoryKey).toBe('Quartal');
    expect(c.seriesKeys).toEqual(['Umsatz', 'Kosten']);
    expect(c.rows).toEqual([
      { Quartal: 'Q1', Umsatz: 1000, Kosten: 400 },
      { Quartal: 'Q2', Umsatz: 1500, Kosten: 500 },
    ]);
  });

  it('coerces localized/formatted numeric strings', () => {
    const c = buildChartData(
      [
        ['Monat', 'Betrag'],
        ['Jan', '1.234,50 €'],
        ['Feb', '25%'],
      ],
      'line',
      ''
    );
    expect(c.rows[0]?.['Betrag']).toBe(1234.5);
    expect(c.rows[1]?.['Betrag']).toBe(25);
  });

  it('strips yen/generic currency symbols (prefix or suffix)', () => {
    const c = buildChartData(
      [
        ['Land', 'Betrag'],
        ['JP', '¥1200'],
        ['XX', '300 ¤'],
      ],
      'bar',
      ''
    );
    expect(c.rows[0]?.['Betrag']).toBe(1200);
    expect(c.rows[1]?.['Betrag']).toBe(300);
  });

  it('de-duplicates repeated series names', () => {
    const c = buildChartData(
      [
        ['X', 'A', 'A'],
        ['r1', 1, 2],
      ],
      'bar',
      ''
    );
    expect(c.seriesKeys).toEqual(['A', 'A (2)']);
  });

  it('falls back for missing headers/labels and non-numbers → 0', () => {
    const c = buildChartData(
      [
        ['', ''],
        ['', 'x'],
      ],
      'bar',
      ''
    );
    expect(c.categoryKey).toBe('Kategorie');
    expect(c.seriesKeys).toEqual(['Reihe 1']);
    expect(c.rows[0]).toEqual({ Kategorie: 'Zeile 1', 'Reihe 1': 0 });
  });

  it('returns no rows for a header-only range', () => {
    expect(buildChartData([['A', 'B']], 'pie', '').rows).toEqual([]);
  });
});
