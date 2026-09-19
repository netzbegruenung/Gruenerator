/**
 * The pure parts of the repository: the rule that keeps the three sharing
 * fields consistent, and how an optional column merges on upsert. Everything
 * else needs Postgres and is not covered here.
 *
 * Run with: cd apps/api && npx vitest run services/user/textFormRepository.vitest.ts
 */
import { describe, expect, it } from 'vitest';

import {
  applySharingPatch,
  mergeOptionalColumn,
  type TextFormSharingState,
} from './textFormRepository.js';

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

describe('mergeOptionalColumn', () => {
  /** Am Aufrufort die Spaltenreferenz; hier nur ein unterscheidbarer Wert. */
  const STORED = Symbol('gespeicherte Spalte');

  it('keeps the stored value when the field was not sent (undefined)', () => {
    expect(mergeOptionalColumn(undefined, STORED)).toBe(STORED);
  });

  it('clears the column when null was sent explicitly', () => {
    expect(mergeOptionalColumn(null, STORED)).toBeNull();
  });

  it('replaces the stored value with a sent one', () => {
    expect(mergeOptionalColumn('Kurz und knapp', STORED)).toBe('Kurz und knapp');
  });

  it('treats the empty string as a sent value, not as absence', () => {
    expect(mergeOptionalColumn('', STORED)).toBe('');
  });
});
