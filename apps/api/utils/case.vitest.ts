import { describe, it, expect } from 'vitest';

import { toCamelCase } from './case.js';

describe('toCamelCase', () => {
  it('returns primitives unchanged', () => {
    expect(toCamelCase(42)).toBe(42);
    expect(toCamelCase('hi')).toBe('hi');
    expect(toCamelCase(null)).toBe(null);
    expect(toCamelCase(true)).toBe(true);
  });

  it('converts snake_case keys to camelCase', () => {
    expect(toCamelCase({ share_token: 'abc', media_type: 'image' })).toEqual({
      shareToken: 'abc',
      mediaType: 'image',
    });
  });

  it('leaves already-camelCase keys untouched', () => {
    expect(toCamelCase({ shareToken: 'abc' })).toEqual({ shareToken: 'abc' });
  });

  it('recurses into nested objects', () => {
    expect(toCamelCase({ outer_key: { inner_key: 1 } })).toEqual({
      outerKey: { innerKey: 1 },
    });
  });

  it('recurses into arrays of objects', () => {
    expect(toCamelCase([{ a_b: 1 }, { c_d: 2 }])).toEqual([{ aB: 1 }, { cD: 2 }]);
  });

  it('handles multi-underscore keys', () => {
    expect(toCamelCase({ a_b_c: 1 })).toEqual({ aBC: 1 });
  });

  // `pg` returns every TIMESTAMPTZ as a Date. A Date is `typeof 'object'` with
  // zero enumerable own properties, so the generic object branch used to rebuild
  // it as `{}` and the timestamp disappeared silently.
  it('serialises Date values instead of flattening them to {}', () => {
    const created = new Date('2026-07-06T18:43:52.349Z');
    expect(toCamelCase({ created_at: created })).toEqual({
      createdAt: '2026-07-06T18:43:52.349Z',
    });
  });

  it('serialises Dates nested in arrays and objects', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(toCamelCase([{ created_at: d }])).toEqual([{ createdAt: '2026-01-02T03:04:05.000Z' }]);
    expect(toCamelCase({ outer_key: { created_at: d } })).toEqual({
      outerKey: { createdAt: '2026-01-02T03:04:05.000Z' },
    });
  });
});
