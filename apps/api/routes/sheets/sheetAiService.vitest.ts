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
