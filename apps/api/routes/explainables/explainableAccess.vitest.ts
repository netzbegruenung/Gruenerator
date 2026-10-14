import { describe, expect, it } from 'vitest';

import { canRead, type ExplainableAccessRow } from './explainableAccess.js';

const OWNER = 'owner-id';
const row = (share_mode: string, deleted = false): ExplainableAccessRow => ({
  user_id: OWNER,
  share_mode,
  deleted_at: deleted ? new Date() : null,
});

describe('canRead', () => {
  it.each([
    // mode, viewer, expected
    ['private', OWNER, 'owner'],
    ['private', 'other', 'not_found'],
    ['private', null, 'not_found'],
    ['authenticated', OWNER, 'owner'],
    ['authenticated', 'other', 'viewer'],
    ['authenticated', null, 'login_required'],
    ['public', OWNER, 'owner'],
    ['public', 'other', 'viewer'],
    ['public', null, 'viewer'],
  ] as const)('%s for %s → %s', (mode, viewer, expected) => {
    expect(canRead(row(mode), viewer)).toBe(expected);
  });

  it('hides trashed rows from everyone, the owner included', () => {
    for (const mode of ['private', 'authenticated', 'public']) {
      expect(canRead(row(mode, true), OWNER)).toBe('not_found');
      expect(canRead(row(mode, true), null)).toBe('not_found');
    }
  });

  it('a missing row is not_found', () => {
    expect(canRead(null, OWNER)).toBe('not_found');
  });
});
