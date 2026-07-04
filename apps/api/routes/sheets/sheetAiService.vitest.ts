import { sheetOperationSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { normalizeRawOp } from './sheetAiService.js';

/**
 * normalizeRawOp coerces the `values` shape mistakes models make most often on
 * set_range_values (the op used to modify existing cells) so the op validates
 * instead of being silently dropped — which is what surfaced to users as
 * "keine Tabellen-Änderung erkannt" even though the model DID plan an edit.
 */
describe('normalizeRawOp', () => {
  const parse = (raw: unknown) => sheetOperationSchema.safeParse(normalizeRawOp(raw));

  it('wraps a bare scalar value into a single cell ([[x]])', () => {
    const result = parse({ type: 'set_range_values', range: 'B1', values: 2500 });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual([[2500]]);
    }
  });

  it('wraps a 1D row array into one row ([[...]])', () => {
    const result = parse({ type: 'set_range_values', range: 'A1:C1', values: ['a', 'b', 'c'] });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual([['a', 'b', 'c']]);
    }
  });

  it('leaves a well-shaped 2D array untouched', () => {
    const values = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const result = parse({ type: 'set_range_values', range: 'A1:B2', values });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual(values);
    }
  });

  it('leaves a single-column 2D array untouched', () => {
    const values = [['a'], ['b'], ['c']];
    const result = parse({ type: 'set_range_values', range: 'A1:A3', values });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'set_range_values') {
      expect(result.data.values).toEqual(values);
    }
  });

  it('does not touch other operation types', () => {
    const formulaOp = { type: 'set_formula', cell: 'D2', formula: '=SUM(A1:A10)' };
    expect(normalizeRawOp(formulaOp)).toBe(formulaOp);
    const clearOp = { type: 'clear_range', range: 'B2:B5' };
    expect(normalizeRawOp(clearOp)).toBe(clearOp);
  });

  it('passes non-objects through untouched', () => {
    expect(normalizeRawOp(null)).toBe(null);
    expect(normalizeRawOp('nonsense')).toBe('nonsense');
    expect(normalizeRawOp(42)).toBe(42);
  });
});

describe('Phase 0 operation schema', () => {
  it('validates set_number_format', () => {
    const r = sheetOperationSchema.safeParse({
      type: 'set_number_format',
      range: 'B2:B20',
      pattern: '#,##0.00 €',
    });
    expect(r.success).toBe(true);
  });

  it('validates set_range_values with asText (force-text)', () => {
    const r = sheetOperationSchema.safeParse({
      type: 'set_range_values',
      range: 'A2:A5',
      values: [['00123'], ['2-2']],
      asText: true,
    });
    expect(r.success).toBe(true);
  });

  it('normalizeRawOp leaves set_number_format untouched', () => {
    const op = { type: 'set_number_format', range: 'B2', pattern: '0%' };
    expect(normalizeRawOp(op)).toBe(op);
  });
});

describe('add_chart operation schema', () => {
  it('validates each chart type', () => {
    for (const chartType of ['bar', 'line', 'area', 'pie', 'donut']) {
      expect(
        sheetOperationSchema.safeParse({ type: 'add_chart', range: 'A1:D5', chartType }).success
      ).toBe(true);
    }
  });

  it('rejects an unknown chart type', () => {
    expect(
      sheetOperationSchema.safeParse({ type: 'add_chart', range: 'A1:D5', chartType: 'radar' })
        .success
    ).toBe(false);
  });
});

describe('Phase 1 structural operation schema', () => {
  it('validates insert_rows / delete_rows (1-based row + count)', () => {
    expect(sheetOperationSchema.safeParse({ type: 'insert_rows', at: 5, count: 2 }).success).toBe(
      true
    );
    expect(sheetOperationSchema.safeParse({ type: 'delete_rows', at: 3, count: 1 }).success).toBe(
      true
    );
  });

  it('rejects non-positive row targets/counts', () => {
    expect(sheetOperationSchema.safeParse({ type: 'insert_rows', at: 0, count: 2 }).success).toBe(
      false
    );
    expect(sheetOperationSchema.safeParse({ type: 'delete_rows', at: 3, count: 0 }).success).toBe(
      false
    );
  });

  it('validates insert_columns / delete_columns (column letter + count)', () => {
    expect(
      sheetOperationSchema.safeParse({ type: 'insert_columns', at: 'C', count: 1 }).success
    ).toBe(true);
    expect(
      sheetOperationSchema.safeParse({ type: 'delete_columns', at: 'AA', count: 2 }).success
    ).toBe(true);
  });

  it('validates merge_cells / unmerge_cells', () => {
    expect(sheetOperationSchema.safeParse({ type: 'merge_cells', range: 'A1:C1' }).success).toBe(
      true
    );
    expect(sheetOperationSchema.safeParse({ type: 'unmerge_cells', range: 'A1:C1' }).success).toBe(
      true
    );
  });
});
