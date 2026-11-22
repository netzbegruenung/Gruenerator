import { describe, expect, it } from 'vitest';

import {
  buildMemberActions,
  canChangeMemberRole,
  canLeaveProject,
  canShareInviteLink,
  isTeamProject,
} from './settingsRules';

describe('canChangeMemberRole', () => {
  it('lets an admin change another member', () => {
    expect(canChangeMemberRole(true, 'b', 'a', 'c')).toBe(true);
  });
  it('refuses non-admins, self and the creator', () => {
    expect(canChangeMemberRole(false, 'b', 'a', 'c')).toBe(false);
    expect(canChangeMemberRole(true, 'a', 'a', 'c')).toBe(false);
    expect(canChangeMemberRole(true, 'c', 'a', 'c')).toBe(false);
  });
});

describe('canLeaveProject', () => {
  it('allows members of a team project', () => {
    expect(canLeaveProject({ group_type: 'standard', created_by: 'c' }, 'a')).toBe(true);
  });
  it('allows members of a project stored as personal too (type does not matter)', () => {
    expect(canLeaveProject({ group_type: 'personal', created_by: 'c' }, 'a')).toBe(true);
  });
  it('refuses the creator, the system project, and unknown users', () => {
    expect(canLeaveProject({ group_type: 'standard', created_by: 'a' }, 'a')).toBe(false);
    expect(canLeaveProject({ group_type: 'standard', is_system: true, created_by: 'c' }, 'a')).toBe(
      false
    );
    expect(canLeaveProject({ group_type: 'standard', created_by: 'c' }, null)).toBe(false);
  });
});

describe('canShareInviteLink', () => {
  it('needs admin, a team project and a token', () => {
    const g = { group_type: 'standard' as const, join_token: 't' };
    expect(canShareInviteLink(g, true)).toBe(true);
    expect(canShareInviteLink(g, false)).toBe(false);
    expect(canShareInviteLink({ ...g, join_token: null }, true)).toBe(false);
    expect(canShareInviteLink({ ...g, is_system: true }, true)).toBe(false);
    expect(canShareInviteLink({ ...g, archived_at: '2026-11-22T10:00:00Z' }, true)).toBe(false);
    // A project stored as personal can be invited into like any other.
    expect(canShareInviteLink({ ...g, group_type: 'personal' }, true)).toBe(true);
  });
});

describe('isTeamProject / buildMemberActions', () => {
  it('classifies projects', () => {
    expect(isTeamProject({ group_type: 'standard' })).toBe(true);
    expect(isTeamProject({ group_type: 'personal' })).toBe(true);
    expect(isTeamProject({ is_system: true })).toBe(false);
  });
  it('offers the opposite role', () => {
    expect(buildMemberActions('member')[0].id).toBe('make-admin');
    expect(buildMemberActions('admin')[0].id).toBe('remove-admin');
  });
  it('always offers removal as the second action', () => {
    expect(buildMemberActions('member')[1].id).toBe('remove-member');
    expect(buildMemberActions('admin')[1].id).toBe('remove-member');
  });
});
