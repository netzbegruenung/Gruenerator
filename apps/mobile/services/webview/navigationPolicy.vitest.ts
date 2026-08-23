import { describe, expect, it } from 'vitest';

import {
  decideNavigation,
  WEBVIEW_ORIGIN_WHITELIST,
  type NavigationPolicy,
} from './navigationPolicy';

const POLICY: NavigationPolicy = {
  origin: 'https://gruenerator.eu',
  allowedPathPrefixes: ['/studio/canvas/'],
};

const at = (url: string) => decideNavigation({ url, isTopFrame: true }, POLICY);

describe('decideNavigation', () => {
  describe('allows the pinned page and what it needs', () => {
    it.each([
      'https://gruenerator.eu/studio/canvas/abc',
      'https://gruenerator.eu/studio/canvas/abc?embedded=1',
      // The handoff redirect itself, and every form post / download.
      'https://gruenerator.eu/api/auth/v2/web-handoff?redirect=%2Fstudio%2Fcanvas%2Fabc',
      'https://gruenerator.eu/api/canvas/abc',
    ])('%s', (url) => {
      expect(at(url)).toBe('allow');
    });

    it('allows about:blank (intermediate step in some redirect chains)', () => {
      expect(at('about:blank')).toBe('allow');
    });

    it('does not gate sub-resources — that would break fonts and images', () => {
      expect(
        decideNavigation({ url: 'https://fonts.example/x.woff2', isTopFrame: false }, POLICY)
      ).toBe('allow');
    });
  });

  describe('blocks navigation into the rest of our own app', () => {
    it.each([
      // The canvas page's own back button used to go here.
      'https://gruenerator.eu/workplace',
      // The 401 redirect.
      'https://gruenerator.eu/login?redirectTo=%2Fstudio%2Fcanvas%2Fabc',
      // The terms banner's three links.
      'https://gruenerator.eu/datenschutz',
      'https://gruenerator.eu/nutzungsbedingungen',
      'https://gruenerator.eu/ki-transparenz',
      'https://gruenerator.eu/',
      // A sibling route that merely starts like the allowed prefix.
      'https://gruenerator.eu/studio/canvas-admin/abc',
    ])('%s', (url) => {
      expect(at(url)).toBe('block');
    });
  });

  describe('sends genuine outbound links to the system browser', () => {
    it.each([
      // The editor's Unsplash attribution renders target="_blank" links.
      'https://unsplash.com',
      'https://unsplash.com/@someone',
      // A different host on our own domain is still a different origin.
      'https://beta.gruenerator.eu/studio/canvas/abc',
      // So is the same host over plain http.
      'http://gruenerator.eu/studio/canvas/abc',
    ])('%s', (url) => {
      expect(at(url)).toBe('external');
    });
  });

  describe('blocks non-http schemes outright — never hands them to the OS', () => {
    it.each([
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      // Android intent: URLs can launch arbitrary activities.
      'intent://evil/#Intent;scheme=http;end',
      'file:///etc/passwd',
      'tel:+4930123456',
      'gruenerator://auth/callback?code=abc',
    ])('%s', (url) => {
      expect(at(url)).toBe('block');
    });
  });

  it('blocks unparseable URLs rather than guessing', () => {
    expect(at('not a url')).toBe('block');
  });

  it('treats a missing isTopFrame as a top-level navigation', () => {
    // Android omits fields iOS supplies; the safe reading is "this is a
    // navigation", so the policy applies rather than being skipped.
    expect(decideNavigation({ url: 'https://gruenerator.eu/workplace' }, POLICY)).toBe('block');
  });
});

/**
 * The whitelist value itself, because it looks like a mistake.
 *
 * `['*']` on a screen whose whole purpose is containment invites a tightening
 * that silently disables the gate: react-native-webview hands a URL that fails
 * the whitelist to `Linking.openURL` WITHOUT calling
 * `onShouldStartLoadWithRequest`. This test re-implements the library's
 * matcher (`WebViewShared.tsx`) so the trap is visible in our own suite rather
 * than only in a comment.
 */
describe('WEBVIEW_ORIGIN_WHITELIST', () => {
  // Verbatim from react-native-webview's WebViewShared.tsx.
  const extractOrigin = (url: string): string => {
    const result = /^[A-Za-z][A-Za-z0-9+\-.]+:(\/\/)?[^/]*/.exec(url);
    return result === null ? '' : result[0];
  };
  const toRegex = (entry: string): string =>
    `^${entry
      .replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
      .replace(/-/g, '\\x2d')
      .replace(/\\\*/g, '.*')}`;
  const passes = (whitelist: readonly string[], url: string): boolean =>
    ['about:blank', ...whitelist].map(toRegex).some((r) => new RegExp(r).test(extractOrigin(url)));

  const HANDOFF = 'https://gruenerator.eu/api/auth/v2/web-handoff?ott=x&redirect=/boards/1';

  it('lets our own URLs reach the gate', () => {
    expect(passes(WEBVIEW_ORIGIN_WHITELIST, HANDOFF)).toBe(true);
    expect(passes(WEBVIEW_ORIGIN_WHITELIST, 'https://gruenerator.eu/studio/canvas/1')).toBe(true);
  });

  it('lets foreign URLs reach the gate too, so decideNavigation decides', () => {
    // Not a hole: `decideNavigation` sends these to the in-app browser itself,
    // and drops `intent:` entirely. Handing them to the library instead would
    // mean `Linking.openURL('intent://…')` — an arbitrary Android activity.
    expect(passes(WEBVIEW_ORIGIN_WHITELIST, 'https://evil.com/x')).toBe(true);
    expect(passes(WEBVIEW_ORIGIN_WHITELIST, 'intent://scan/#Intent;end')).toBe(true);
    expect(at('intent://scan/#Intent;end')).toBe('block');
  });

  it('shows why the obvious tightening is wrong', () => {
    // The shipped value. It matched nothing, so EVERY navigation — including
    // the handoff that opens the page — went to the system browser.
    expect(passes(['https://gruenerator.eu/*'], HANDOFF)).toBe(false);
    // And dropping the `/*` is not the fix either: the compiled pattern is an
    // unanchored prefix, so a look-alike domain passes.
    expect(passes(['https://gruenerator.eu'], 'https://gruenerator.eu.evil.com/x')).toBe(true);
  });
});
