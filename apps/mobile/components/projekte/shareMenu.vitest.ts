import { describe, expect, it } from 'vitest';

import { buildItemMenuActions, buildShareActions, projectRoleLabel } from './shareMenu';

const doc = (projectWrite: boolean | null) => ({ projectWrite, post: null });

describe('buildShareActions', () => {
  it('is empty when the person may not manage', () => {
    expect(buildShareActions(doc(true), false)).toEqual([]);
  });
  it('never offers management for posts', () => {
    const post = { projectWrite: null, post: {} as never };
    expect(buildShareActions(post, true)).toEqual([]);
  });
  it('offers only remove for items without a role', () => {
    expect(buildShareActions(doc(null), true).map((a) => a.id)).toEqual(['remove']);
  });
  it('checks the current role for collaborative documents', () => {
    const edit = buildShareActions(doc(true), true);
    expect(edit.map((a) => [a.id, a.state])).toEqual([
      ['write', 'on'],
      ['read', 'off'],
      ['remove', undefined],
    ]);
    const read = buildShareActions(doc(false), true);
    expect(read.map((a) => a.state)).toEqual(['off', 'on', undefined]);
  });
  it('marks remove as destructive', () => {
    const remove = buildShareActions(doc(null), true)[0];
    expect(remove?.attributes?.destructive).toBe(true);
  });
});

describe('buildItemMenuActions', () => {
  it('puts management before moderation in one list', () => {
    const share = buildShareActions(doc(false), true);
    expect(buildItemMenuActions(share, true, true).map((a) => a.id)).toEqual([
      'write',
      'read',
      'remove',
      'report',
      'hide',
    ]);
  });
  it('is empty when nothing applies', () => {
    expect(buildItemMenuActions([], false, false)).toEqual([]);
  });
});

describe('projectRoleLabel', () => {
  it('mirrors the web labels', () => {
    expect(projectRoleLabel({ projectWrite: null })).toBeNull();
    expect(projectRoleLabel({ projectWrite: true })).toBe('Bearbeiten');
    expect(projectRoleLabel({ projectWrite: false })).toBe('Nur lesen');
  });
});
