import { describe, expect, it } from 'vitest';

import { findTakeGroups } from '../takeGroups.js';

import { radwegUnits } from './fixtures.js';

describe('findTakeGroups', () => {
  const units = [...radwegUnits().values()];
  const groups = findTakeGroups(units);
  const groupOf = (id: string) => groups.find((g) => g.unitIds.includes(id));

  it('groups both attempts at the introduction and prefers the second', () => {
    const intro = groupOf('c1.s2');
    expect(intro?.unitIds).toContain('c1.s5');
    expect(intro?.preferred).toBe('c1.s5');
  });

  it('groups the aborted request with its full restart', () => {
    const request = groupOf('c1.s9');
    expect(request?.unitIds).toEqual(['c1.s9', 'c1.s11']);
    expect(request?.preferred).toBe('c1.s11');
  });

  it('groups the withdrawn CSU sentence with the softer one and prefers the latter', () => {
    const csu = groupOf('c1.s12');
    expect(csu?.unitIds).toContain('c1.s16');
    expect(csu?.preferred).toBe('c1.s16');
  });

  it('leaves short chatter alone', () => {
    expect(groupOf('c1.s1')).toBeUndefined();
  });
});
