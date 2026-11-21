import { describe, expect, it } from 'vitest';

import { canManageShare } from './types.js';

describe('canManageShare', () => {
  it('lets admins manage any share', () => {
    expect(canManageShare({ sharedById: 'a' }, true, 'b')).toBe(true);
    expect(canManageShare({ sharedById: null }, true, null)).toBe(true);
  });
  it('lets the sharer manage their own share', () => {
    expect(canManageShare({ sharedById: 'a' }, false, 'a')).toBe(true);
    expect(canManageShare({ sharedById: '7' }, null, 7)).toBe(true);
  });
  it('refuses everyone else', () => {
    expect(canManageShare({ sharedById: 'a' }, false, 'b')).toBe(false);
    expect(canManageShare({ sharedById: null }, false, 'b')).toBe(false);
    expect(canManageShare({ sharedById: 'a' }, false, null)).toBe(false);
    expect(canManageShare({ sharedById: 'a' }, undefined, '')).toBe(false);
  });
});
