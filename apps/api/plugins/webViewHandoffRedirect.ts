/**
 * Redirect-target validation for the WebView handoff.
 *
 * Kept in its own module (rather than inline in the plugin) because it is the
 * security boundary of the whole flow: the handoff mints a real session cookie
 * and then sends the browser wherever `redirect` points. An open redirect here
 * would hand a freshly-authenticated cookie to an attacker-chosen origin.
 *
 * Two independent gates, both must pass:
 *   1. the string must be an unambiguously *relative*, non-traversing path, and
 *   2. it must sit under one of the paths we actually embed.
 *
 * Gate 2 exists because gate 1 alone would still allow any in-app route,
 * including `/logout` or an admin surface. The WebView is meant to show one
 * screen; the allowlist keeps the blast radius at that screen.
 */

/**
 * Paths the mobile app is allowed to embed. Trailing slash matters: `/texte/`
 * must not also match a hypothetical `/texte-admin`.
 *
 * Kept in sync by hand with the `path:` values passed to the `web-viewer`
 * screen. Grep for `pathname: '/(fullscreen)/web-viewer'` in `apps/mobile`
 * before changing this list — every caller there needs an entry, or that
 * content type silently stops opening.
 */
export const EMBEDDABLE_PATH_PREFIXES: readonly string[] = [
  '/boards/',
  '/datenbank/',
  '/documents/',
  '/gruenerator/',
  '/notebook/',
  '/studio/canvas/',
  '/texte/',
];

export type RedirectRejection =
  | 'empty'
  | 'not-relative'
  | 'protocol-relative'
  | 'backslash'
  | 'control-character'
  | 'fragment'
  | 'traversal'
  | 'not-allowlisted';

export type RedirectValidation =
  { ok: true; path: string } | { ok: false; reason: RedirectRejection };

// C0 range, DEL, and the space character. Browsers and URL parsers strip or
// fold several of these, which is how `/<TAB>javascript:...` style payloads
// slip past a naive prefix check; CR/LF additionally enable response splitting
// on the Location header.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u0020\u007f]/;

/**
 * Rejects anything that is not a plain, in-app, allowlisted path.
 *
 * Deliberately does NOT normalise or repair a bad value — a redirect we had to
 * fix up is a redirect we did not understand.
 */
export function validateRedirectTarget(
  raw: string,
  allowedPrefixes: readonly string[] = EMBEDDABLE_PATH_PREFIXES
): RedirectValidation {
  if (raw.length === 0) return { ok: false, reason: 'empty' };

  // Browsers treat `\` as `/` in several positions, so `/\evil.com` navigates
  // off-origin while looking relative to a string check.
  if (raw.includes('\\')) return { ok: false, reason: 'backslash' };

  if (FORBIDDEN_CHARS.test(raw)) return { ok: false, reason: 'control-character' };

  if (!raw.startsWith('/')) return { ok: false, reason: 'not-relative' };

  // `//host` is protocol-relative: same-origin to a prefix check, cross-origin
  // to the browser.
  if (raw.startsWith('//')) return { ok: false, reason: 'protocol-relative' };

  // A fragment can only be resolved client-side; carrying one adds nothing and
  // gives another place for a parser disagreement to hide.
  if (raw.includes('#')) return { ok: false, reason: 'fragment' };

  // Compare on the path alone — a query string is allowed (the embedded mode
  // rides on `?embedded=1`) but must not be able to smuggle in a prefix match.
  const pathOnly = raw.split('?', 1)[0] ?? '';

  // `/studio/canvas/../../admin` passes a prefix check but resolves elsewhere.
  // Reject the segment rather than resolving it: the allowlist is only
  // meaningful if the string it matched is the string the browser will use.
  if (pathOnly.split('/').includes('..')) return { ok: false, reason: 'traversal' };

  if (!allowedPrefixes.some((prefix) => pathOnly.startsWith(prefix))) {
    return { ok: false, reason: 'not-allowlisted' };
  }

  return { ok: true, path: raw };
}
