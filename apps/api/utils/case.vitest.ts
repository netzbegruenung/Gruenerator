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
});
