import { describe, expect, it } from 'vitest';

import { validateRedirectTarget } from './webViewHandoffRedirect.js';

describe('validateRedirectTarget', () => {
  describe('accepts', () => {
    it.each([
      ['/studio/canvas/abc-123', 'plain embeddable path'],
      ['/studio/canvas/abc-123?embedded=1', 'query string (the embedded switch)'],
      ['/datenbank/vorlagen?selected=42', 'query string already used by the app today'],
      ['/boards/1', 'boards'],
      ['/notebook/1', 'notebooks'],
      ['/texte/1', 'texts'],
      ['/gruenerator/mein-slug', 'agent slug'],
      ['/documents/1', 'shared documents'],
      ['/office/1', 'office dispatcher — docs, sheets and presentations'],
    ])('%s — %s', (input) => {
      expect(validateRedirectTarget(input)).toEqual({ ok: true, path: input });
    });

    // The allowlist is hand-maintained against the mobile callers, and one
    // entry was already missed once (/documents/, shipped in
    // GroupContentSection.tsx long before this endpoint existed). Pin every
    // path the app actually opens, so a new caller without an entry fails here
    // rather than as a 400 on a device.
    it.each([
      ['/boards/1'],
      ['/gruenerator/slug'],
      ['/notebook/1'],
      ['/texte/1'],
      ['/datenbank/vorlagen?selected=1'],
      ['/documents/1'],
      ['/office/1'],
      ['/studio/canvas/1'],
    ])('covers the live mobile caller %s', (input) => {
      expect(validateRedirectTarget(input).ok).toBe(true);
    });
  });

  describe('rejects off-origin targets', () => {
    it.each([
      ['https://evil.com/studio/canvas/1', 'not-relative'],
      ['//evil.com/studio/canvas/1', 'protocol-relative'],
      ['/\\evil.com', 'backslash'],
      ['/studio/canvas/1\\..\\..\\admin', 'backslash'],
      ['gruenerator://auth/callback', 'not-relative'],
      ['javascript:alert(1)', 'not-relative'],
    ])('%s → %s', (input, reason) => {
      expect(validateRedirectTarget(input)).toEqual({ ok: false, reason });
    });
  });

  describe('rejects parser-disagreement payloads', () => {
    it.each([
      ['/\tjavascript:alert(1)', 'control-character'],
      ['/studio/canvas/1\r\nSet-Cookie: a=b', 'control-character'],
      ['/studio/canvas/1 ', 'control-character'],
      [' /studio/canvas/1', 'control-character'],
      ['/studio/canvas/1#/../admin', 'fragment'],
    ])('%j → %s', (input, reason) => {
      expect(validateRedirectTarget(input)).toEqual({ ok: false, reason });
    });
  });

  describe('rejects escapes out of the allowlisted subtree', () => {
    it.each([
      ['/studio/canvas/../../admin', 'traversal'],
      ['/studio/canvas/..', 'traversal'],
      ['/admin', 'not-allowlisted'],
      ['/', 'not-allowlisted'],
      ['/logout', 'not-allowlisted'],
      // A prefix must not match a sibling route that merely starts the same.
      ['/texte-admin/1', 'not-allowlisted'],
      // The query string must not be able to fake a prefix match.
      ['/admin?x=/studio/canvas/1', 'not-allowlisted'],
    ])('%s → %s', (input, reason) => {
      expect(validateRedirectTarget(input)).toEqual({ ok: false, reason });
    });

    it('rejects the empty string', () => {
      expect(validateRedirectTarget('')).toEqual({ ok: false, reason: 'empty' });
    });
  });

  it('honours a caller-supplied allowlist', () => {
    expect(validateRedirectTarget('/studio/canvas/1', ['/boards/'])).toEqual({
      ok: false,
      reason: 'not-allowlisted',
    });
  });
});
