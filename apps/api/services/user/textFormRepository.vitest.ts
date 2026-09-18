/**
 * The two pure parts of the injection cache policy: how a key is shaped and
 * how long an entry may live. Everything else in the repository needs Postgres
 * and is not covered here.
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormRepository.vitest.ts
 */
import { describe, expect, it } from 'vitest';

import { injectionCacheKey, injectionTtlMs, type TextFormInjection } from './textFormRepository.js';

const OWN_TTL_MS = 60 * 60 * 1000;
const FOREIGN_TTL_MS = 5 * 60 * 1000;

function injection(access: TextFormInjection['access']): TextFormInjection {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'custom',
    textType: null,
    title: 'Mein Rezept',
    styleBlock: 'kurz und konkret',
    access,
  };
}

describe('injectionCacheKey', () => {
  it('keeps the two lookup scopes apart for the same value', () => {
    expect(injectionCacheKey('mention', 'u1', 'presse')).not.toBe(
      injectionCacheKey('id', 'u1', 'presse')
    );
  });

  it('ends in `::<value>`, which is what invalidation matches on', () => {
    expect(injectionCacheKey('mention', 'u1', 'presse').endsWith('::presse')).toBe(true);
    expect(injectionCacheKey('id', 'u1', 'abc').endsWith('::abc')).toBe(true);
  });

  it('separates users, so one person cannot read the hit of another', () => {
    expect(injectionCacheKey('mention', 'u1', 'presse')).not.toBe(
      injectionCacheKey('mention', 'u2', 'presse')
    );
  });
});

describe('injectionTtlMs', () => {
  it('holds the own recipe of the caller for an hour', () => {
    expect(injectionTtlMs(injection('own'))).toBe(OWN_TTL_MS);
  });

  it('holds a group-shared or public recipe for five minutes', () => {
    expect(injectionTtlMs(injection('group'))).toBe(FOREIGN_TTL_MS);
    expect(injectionTtlMs(injection('public'))).toBe(FOREIGN_TTL_MS);
  });

  it('holds a miss for five minutes — a share elsewhere can turn it into a hit', () => {
    expect(injectionTtlMs(null)).toBe(FOREIGN_TTL_MS);
  });
});
