import { describe, expect, it } from 'vitest';

import { checkConventionAccess, checkSpeechAccess, type ConventionViewer } from './access.js';

const user: ConventionViewer = { userId: 'u', isAdmin: false, audience: 'de-DE' };
const admin: ConventionViewer = { ...user, isAdmin: true };
const atUser: ConventionViewer = { ...user, audience: 'de-AT' };

const conv = (o: Partial<Parameters<typeof checkConventionAccess>[1]> = {}) => ({
  id: 'c',
  status: 'published' as const,
  audience: 'all' as const,
  access_password_hash: null,
  ...o,
});

describe('checkConventionAccess', () => {
  it.each([
    ['draft/user', user, conv({ status: 'draft' }), false, 'not_found'],
    ['draft/admin', admin, conv({ status: 'draft' }), false, 'ok'],
    ['AT convention/DE user', user, conv({ audience: 'de-AT' }), false, 'not_found'],
    ['AT convention/AT user', atUser, conv({ audience: 'de-AT' }), false, 'ok'],
    ['DE convention/AT user', atUser, conv({ audience: 'de-DE' }), false, 'not_found'],
    ['all/AT user', atUser, conv(), false, 'ok'],
    ['password without grant', user, conv({ access_password_hash: 'a:b' }), false, 'locked'],
    ['password with grant', user, conv({ access_password_hash: 'a:b' }), true, 'ok'],
    ['password/admin', admin, conv({ access_password_hash: 'a:b' }), false, 'ok'],
    [
      'draft+password+grant/user',
      user,
      conv({ status: 'draft', access_password_hash: 'a:b' }),
      true,
      'not_found',
    ],
  ] as const)('%s -> %s', (_n, viewer, c, grant, expected) => {
    expect(checkConventionAccess(viewer, c, grant)).toBe(expected);
  });
});

describe('checkSpeechAccess', () => {
  it('hidden speech/user -> not_found', () => {
    expect(checkSpeechAccess(user, conv(), { moderation: 'hidden' }, false)).toBe('not_found');
  });
  it('hidden speech/admin -> ok', () => {
    expect(checkSpeechAccess(admin, conv(), { moderation: 'hidden' }, false)).toBe('ok');
  });
  it('ok speech inherits locked', () => {
    expect(
      checkSpeechAccess(user, conv({ access_password_hash: 'a:b' }), { moderation: 'ok' }, false)
    ).toBe('locked');
  });
  it('ok speech/user -> ok', () => {
    expect(checkSpeechAccess(user, conv(), { moderation: 'ok' }, false)).toBe('ok');
  });
});
