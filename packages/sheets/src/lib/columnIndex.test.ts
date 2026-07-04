import { columnIndex, columnLabel } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

/**
 * columnIndex is the inverse of columnLabel and backs the insert/delete-column
 * ops (a wrong mapping would insert/delete the wrong column). Tested here since
 * the sheets package is the consumer.
 */
describe('columnIndex', () => {
  it('maps single letters', () => {
    expect(columnIndex('A')).toBe(0);
    expect(columnIndex('B')).toBe(1);
    expect(columnIndex('Z')).toBe(25);
  });

  it('maps multi-letter columns', () => {
    expect(columnIndex('AA')).toBe(26);
    expect(columnIndex('AB')).toBe(27);
    expect(columnIndex('BA')).toBe(52);
  });

  it('is case-insensitive and trims', () => {
    expect(columnIndex('c')).toBe(2);
    expect(columnIndex('  D ')).toBe(3);
  });

  it('returns -1 for invalid input', () => {
    expect(columnIndex('')).toBe(-1);
    expect(columnIndex('A1')).toBe(-1);
    expect(columnIndex('3')).toBe(-1);
  });

  it('round-trips with columnLabel', () => {
    for (const i of [0, 1, 25, 26, 27, 51, 52, 701, 702]) {
      expect(columnIndex(columnLabel(i))).toBe(i);
    }
  });
});
