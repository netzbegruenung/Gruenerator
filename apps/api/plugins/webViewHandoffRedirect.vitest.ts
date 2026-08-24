import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  EMBEDDABLE_PATH_PREFIXES,
  SHIPPED_BINARY_ONLY_PREFIXES,
  validateRedirectTarget,
} from './webViewHandoffRedirect.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MOBILE_DIR = path.join(REPO_ROOT, 'apps/mobile');

const SKIP_DIRS = new Set(['node_modules', 'ios', 'android', '.expo', 'dist', 'build']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      sourceFiles(full, out);
      continue;
    }
    // `withFileTypes` reports a dangling symlink as neither — `apps/mobile/ios`
    // is full of them (CocoaPods), which is why that directory is skipped
    // outright, but be defensive rather than throw mid-walk.
    if (!entry.isFile()) {
      try {
        if (!statSync(full).isFile()) continue;
      } catch {
        continue;
      }
    }
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Every path the app asks the handoff to open.
 *
 * Two shapes, because there are two ways in. Most surfaces go through the
 * `web-viewer` screen and name their path in its route params. The offscreen
 * sharepic renderer does not — it is a bare WebView with no chrome and no
 * route, so it mints its handoff directly. Scanning only the first shape would
 * report the second as an allowlist entry nobody opens.
 *
 * Template holes (`${item.id}`) become a literal `x`: the id never decides
 * whether a path is allowlisted, the prefix does, and substituting keeps the
 * result something `validateRedirectTarget` can actually judge.
 */
function mobileWebViewPaths(): { file: string; path: string }[] {
  const found: { file: string; path: string }[] = [];
  const patterns = [
    /pathname:\s*'\/\(fullscreen\)\/web-viewer'[\s\S]{0,400}?path:\s*(?:`([^`]*)`|'([^']*)')/g,
    // Direct callers. Only literal arguments are readable here; `web-viewer`
    // passes a computed variable and is covered by the pattern above.
    /mintWebViewHandoff\(\s*(?:`([^`$]*)`|'([^']*)')/g,
  ];

  for (const file of sourceFiles(MOBILE_DIR)) {
    const source = readFileSync(file, 'utf-8');
    for (const callSite of patterns) {
      for (const match of source.matchAll(callSite)) {
        const raw = match[1] ?? match[2] ?? '';
        if (raw.length === 0) continue;
        found.push({
          file: path.relative(REPO_ROOT, file),
          path: raw.replace(/\$\{[^}]*\}/g, 'x'),
        });
      }
    }
  }
  return found;
}

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
      ['/mobile-render', 'offscreen sharepic renderer — an exact entry, no id'],
      ['/mobile-render?embedded=1', 'exact entry still allows the embedded switch'],
    ])('%s — %s', (input) => {
      expect(validateRedirectTarget(input)).toEqual({ ok: true, path: input });
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
      // Same boundary, enforced the other way: an entry without a trailing
      // slash is an exact path, so it licenses neither a longer sibling nor a
      // child segment.
      ['/mobile-render-admin', 'not-allowlisted'],
      ['/mobile-render/secret', 'not-allowlisted'],
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

/**
 * The allowlist against the callers it is supposed to describe.
 *
 * It used to be kept in sync by hand, and this file used to hold a hand-typed
 * copy of the caller list to check it — a third copy of the same knowledge,
 * which is one more place to forget. One entry had already been missed once
 * (`/documents/`, shipped in `GroupContentSection.tsx` long before this
 * endpoint existed), and a miss shows up on a device as a 400, not here.
 */
describe('EMBEDDABLE_PATH_PREFIXES vs. the mobile callers', () => {
  const callers = mobileWebViewPaths();

  it('finds the call sites at all', () => {
    // Without this the two assertions below pass vacuously the day someone
    // renames the route or reformats the `router.push` calls — an empty list
    // satisfies "every caller is allowlisted" perfectly.
    expect(callers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(callers.map((c) => c.file)).size).toBeGreaterThanOrEqual(3);
    // Both shapes, named explicitly: the direct-mint pattern was added for a
    // single caller, and a regex that quietly stops matching it would take the
    // renderer's allowlist entry out of scope without failing anything.
    expect(callers.some((c) => c.path.startsWith('/mobile-render'))).toBe(true);
  });

  it('accepts every path the app opens', () => {
    const rejected = callers
      .filter((c) => !validateRedirectTarget(c.path).ok)
      .map((c) => `${c.path} (${c.file})`);

    expect(rejected).toEqual([]);
  });

  it('has no entry without a caller', () => {
    // A prefix nobody opens is dead surface area on a security boundary: it
    // widens what a stolen handoff token can be pointed at, for nothing.
    // Deliberate survivors live in SHIPPED_BINARY_ONLY_PREFIXES.
    const unused = EMBEDDABLE_PATH_PREFIXES.filter(
      (prefix) =>
        !SHIPPED_BINARY_ONLY_PREFIXES.includes(prefix) &&
        !callers.some((c) =>
          prefix.endsWith('/')
            ? c.path.startsWith(prefix)
            : (c.path.split('?', 1)[0] ?? '') === prefix
        )
    );

    expect(unused).toEqual([]);
  });

  it('keeps the shipped-binary entries inside the allowlist', () => {
    // The exemption list is only meaningful for prefixes that are actually in
    // the allowlist — an entry that drifted out of it exempts nothing and
    // silently stops covering the old binaries it was written for.
    const orphaned = SHIPPED_BINARY_ONLY_PREFIXES.filter(
      (prefix) => !EMBEDDABLE_PATH_PREFIXES.includes(prefix)
    );

    expect(orphaned).toEqual([]);
  });
});
