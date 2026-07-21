import { describe, expect, it } from 'vitest';

import {
  normalizeSharePermissions,
  permissionLevelToShare,
  shareToPermissionLevel,
} from './groupSharePermissions.js';

describe('groupSharePermissions', () => {
  it('editor level and the {read,write,collaborative} form persist an identical row', () => {
    // The doc-centric writer speaks permission_level; the group-centric writer
    // speaks the object form. Both must land the same JSONB row.
    expect(permissionLevelToShare('editor')).toEqual(
      normalizeSharePermissions({ read: true, write: true, collaborative: false })
    );
    expect(permissionLevelToShare('viewer')).toEqual(normalizeSharePermissions({}));
  });

  it('always includes the collaborative field (docs path previously omitted it)', () => {
    expect(permissionLevelToShare('viewer')).toEqual({
      read: true,
      write: false,
      collaborative: false,
    });
  });

  it('normalizeSharePermissions fills defaults (read on, write/collaborative off)', () => {
    expect(normalizeSharePermissions(null)).toEqual({
      read: true,
      write: false,
      collaborative: false,
    });
    expect(normalizeSharePermissions({ write: true })).toEqual({
      read: true,
      write: true,
      collaborative: false,
    });
  });

  it('round-trips the level (write ⇒ editor)', () => {
    expect(shareToPermissionLevel(permissionLevelToShare('editor'))).toBe('editor');
    expect(shareToPermissionLevel(permissionLevelToShare('viewer'))).toBe('viewer');
    expect(shareToPermissionLevel(null)).toBe('viewer');
  });
});
