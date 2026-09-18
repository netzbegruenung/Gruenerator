/**
 * The pure parts of the repository: the injection cache policy (how a key is
 * shaped, how long an entry may live) and the rule that keeps the three sharing
 * fields consistent. Everything else needs Postgres and is not covered here.
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormRepository.vitest.ts
 */
import { describe, expect, it } from 'vitest';

import {
  applySharingPatch,
  injectionCacheKey,
  injectionTtlMs,
  type TextFormInjection,
  type TextFormSharingState,
} from './textFormRepository.js';

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

const LISTED: TextFormSharingState = {
  share_mode: 'authenticated',
  is_public: true,
  public_ownership: 'owner',
};
const PRIVATE: TextFormSharingState = {
  share_mode: 'private',
  is_public: false,
  public_ownership: null,
};

describe('applySharingPatch', () => {
  it('carries an untouched field over from the stored row', () => {
    expect(applySharingPatch(LISTED, { public_ownership: 'public_data' })).toEqual({
      ok: true,
      next: { share_mode: 'authenticated', is_public: true, public_ownership: 'public_data' },
    });
  });

  it('un-lists and drops the attestation when the mode narrows (a)', () => {
    expect(applySharingPatch(LISTED, { share_mode: 'groups' })).toEqual({
      ok: true,
      next: { share_mode: 'groups', is_public: false, public_ownership: null },
    });
    expect(applySharingPatch(LISTED, { share_mode: 'private' })).toEqual({
      ok: true,
      next: { share_mode: 'private', is_public: false, public_ownership: null },
    });
  });

  it('refuses to list publicly without an attestation, writing nothing (b)', () => {
    expect(
      applySharingPatch({ ...PRIVATE, share_mode: 'authenticated' }, { is_public: true })
    ).toEqual({ ok: false, reason: 'ownership_required' });
    expect(applySharingPatch(LISTED, { public_ownership: null })).toEqual({
      ok: false,
      reason: 'ownership_required',
    });
  });

  it('clears the attestation when the recipe is un-listed (c)', () => {
    expect(applySharingPatch(LISTED, { is_public: false })).toEqual({
      ok: true,
      next: { share_mode: 'authenticated', is_public: false, public_ownership: null },
    });
  });

  it('lists the recipe when mode, flag and attestation arrive together', () => {
    expect(
      applySharingPatch(PRIVATE, {
        share_mode: 'authenticated',
        is_public: true,
        public_ownership: 'owner',
      })
    ).toEqual({
      ok: true,
      next: { share_mode: 'authenticated', is_public: true, public_ownership: 'owner' },
    });
  });

  it('never reports ownership_required for a narrowing patch — (a) settles it first', () => {
    expect(applySharingPatch(LISTED, { share_mode: 'private', public_ownership: null })).toEqual({
      ok: true,
      next: { share_mode: 'private', is_public: false, public_ownership: null },
    });
  });
});
