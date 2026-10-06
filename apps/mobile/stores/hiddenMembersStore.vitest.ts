import { beforeEach, describe, expect, it } from 'vitest';

import { __resetAsyncStorage } from '../test/stubs/async-storage';

import { migrateHiddenMembers, useHiddenMembersStore } from './hiddenMembersStore';

const list = (owner: string) => useHiddenMembersStore.getState().byUser[owner] ?? [];

beforeEach(() => {
  __resetAsyncStorage();
  useHiddenMembersStore.setState({ byUser: {} });
});

describe('hiddenMembersStore', () => {
  it('hides and unhides a person for one owner', () => {
    useHiddenMembersStore.getState().hide('A', 'u1', 'Anna');
    expect(list('A').map((m) => m.userId)).toEqual(['u1']);
    useHiddenMembersStore.getState().unhide('A', 'u1');
    expect(list('A')).toEqual([]);
  });

  it('keeps each owner isolated on a shared device', () => {
    useHiddenMembersStore.getState().hide('A', 'u1', 'Anna');
    expect(list('C')).toEqual([]);
    useHiddenMembersStore.getState().unhide('C', 'u1');
    expect(list('A').map((m) => m.userId)).toEqual(['u1']);
  });

  it('unhide only affects that owner', () => {
    useHiddenMembersStore.getState().hide('A', 'u1', 'Anna');
    useHiddenMembersStore.getState().hide('C', 'u1', 'Anna');
    useHiddenMembersStore.getState().unhide('A', 'u1');
    expect(list('A')).toEqual([]);
    expect(list('C').map((m) => m.userId)).toEqual(['u1']);
  });

  it('ignores a duplicate hide', () => {
    useHiddenMembersStore.getState().hide('A', 'u1', 'Anna');
    const first = list('A')[0];
    useHiddenMembersStore.getState().hide('A', 'u1', 'Anna B.');
    expect(list('A')).toEqual([first]);
  });
});

describe('migrateHiddenMembers', () => {
  const ok = { userId: 'u1', name: 'Anna', hiddenAt: '2026-01-01T00:00:00.000Z' };

  it('drops the v1 flat list', () => {
    expect(migrateHiddenMembers({ hidden: [ok] })).toEqual({ byUser: {} });
  });

  it('is safe on missing or malformed state', () => {
    expect(migrateHiddenMembers(undefined)).toEqual({ byUser: {} });
    expect(migrateHiddenMembers(null)).toEqual({ byUser: {} });
    expect(migrateHiddenMembers({})).toEqual({ byUser: {} });
    expect(migrateHiddenMembers({ byUser: 'x' })).toEqual({ byUser: {} });
    expect(migrateHiddenMembers({ byUser: ['x'] })).toEqual({ byUser: {} });
  });

  it('keeps valid entries and drops broken ones', () => {
    expect(migrateHiddenMembers({ byUser: { A: [ok, { userId: 1 }, null], B: 'x' } })).toEqual({
      byUser: { A: [ok] },
    });
  });
});
