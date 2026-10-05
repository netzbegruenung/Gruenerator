import { beforeEach, describe, expect, it } from 'vitest';

import { __resetAsyncStorage } from '../test/stubs/async-storage';

import { migrateHiddenMembers, useHiddenMembersStore } from './hiddenMembersStore';

beforeEach(() => {
  __resetAsyncStorage();
  useHiddenMembersStore.setState({ hidden: [] });
});

describe('hiddenMembersStore', () => {
  it('hides and unhides a person', () => {
    const s = useHiddenMembersStore.getState();
    s.hide('u1', 'Anna');
    expect(useHiddenMembersStore.getState().isHidden('u1')).toBe(true);
    expect(useHiddenMembersStore.getState().isHidden('u2')).toBe(false);
    useHiddenMembersStore.getState().unhide('u1');
    expect(useHiddenMembersStore.getState().hidden).toEqual([]);
  });

  it('ignores a duplicate hide', () => {
    useHiddenMembersStore.getState().hide('u1', 'Anna');
    const first = useHiddenMembersStore.getState().hidden[0];
    useHiddenMembersStore.getState().hide('u1', 'Anna B.');
    expect(useHiddenMembersStore.getState().hidden).toEqual([first]);
  });
});

describe('migrateHiddenMembers', () => {
  it('is safe on missing or malformed state', () => {
    expect(migrateHiddenMembers(undefined)).toEqual({ hidden: [] });
    expect(migrateHiddenMembers(null)).toEqual({ hidden: [] });
    expect(migrateHiddenMembers({})).toEqual({ hidden: [] });
    expect(migrateHiddenMembers({ hidden: 'x' })).toEqual({ hidden: [] });
  });

  it('keeps valid entries and drops broken ones', () => {
    const ok = { userId: 'u1', name: 'Anna', hiddenAt: '2026-01-01T00:00:00.000Z' };
    expect(migrateHiddenMembers({ hidden: [ok, { userId: 1 }, null] })).toEqual({ hidden: [ok] });
  });
});
