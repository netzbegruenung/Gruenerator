import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from './passwordHash.js';

// Produced by the original inline code of the share route (salt used as hex string).
const LEGACY_SHARE_HASH =
  '0123456789abcdef0123456789abcdef:4bc1f51dc4abcbcca640b5b8e3bab6548d5c3c0de3b00a1cba92f9ce124c0b722532d9305f251c9ebbea4513411e5932877225c18ba9e46bb2ec1334a2fbb6c9';

describe('passwordHash', () => {
  it('verify(hash(x)) true', () => {
    expect(verifyPassword('geheim', hashPassword('geheim'))).toBe(true);
  });
  it('verify wrong false', () => {
    expect(verifyPassword('falsch', hashPassword('geheim'))).toBe(false);
  });
  it('verifies a stored share hash', () => {
    expect(verifyPassword('geheim-pw', LEGACY_SHARE_HASH)).toBe(true);
    expect(verifyPassword('anders', LEGACY_SHARE_HASH)).toBe(false);
  });
  it('rejects malformed stored values', () => {
    expect(verifyPassword('x', 'nocolon')).toBe(false);
  });
});
