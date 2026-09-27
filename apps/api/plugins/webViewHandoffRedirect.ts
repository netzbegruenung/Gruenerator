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
 * No longer kept in sync by hand: `webViewHandoffRedirect.vitest.ts` reads the
 * `path:` values off the `web-viewer` callers in `apps/mobile` and fails in
 * both directions — a caller with no entry here (that content type silently
 * stops opening) and an entry no caller uses (dead surface area on a security
 * boundary). Entries that outlive their caller on purpose go in
 * `SHIPPED_BINARY_ONLY_PREFIXES` below, with a reason.
 */
export const EMBEDDABLE_PATH_PREFIXES: readonly string[] = [
  '/boards/',
  '/datenbank/',
  '/documents/',
  '/gruenerator/',
  '/notebook/',
  '/notebooks/',
  // The office dispatcher (`CollabDocRoute`): text documents, sheets and
  // presentations all live under this one path and are told apart by
  // `document_subtype`, so one entry covers all three.
  '/office/',
  '/studio/canvas/',
  '/texte/',
  // No trailing slash, and that is the rule rather than an oversight: an entry
  // that ends in `/` matches a prefix (a resource id follows), one that does not
  // must match the whole path. The offscreen sharepic renderer takes no
  // parameters, so a prefix entry here would also open a future
  // `/mobile-render-admin`.
  '/mobile-render',
];

/**
 * Prefixes that stay although no current caller in `apps/mobile` uses them.
 *
 * The app store version of the app is not this repository: a binary shipped
 * months ago keeps asking for the path it was built with, and dropping the
 * entry breaks it in the field with no way to push a fix. F0 in the
 * frozen-level taxonomy — remove only once the old binaries are gone.
 */
export const SHIPPED_BINARY_ONLY_PREFIXES: readonly string[] = [
  // Singular `/notebook/:id`, a legacy route that redirects to `/notebooks/:id`.
  // Current builds open the plural path directly (`GroupContentSection.tsx`);
  // builds up to 08/2026 send the singular one.
  '/notebook/',
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

  // Entries ending in `/` are prefixes (an id follows); the rest are exact
  // paths. Without the distinction every parameterless route would also license
  // its own longer neighbours — `/mobile-render` would open
  // `/mobile-render-admin` — which is the same segment-boundary bug the
  // trailing slashes above exist to avoid.
  const licensed = allowedPrefixes.some((prefix) =>
    prefix.endsWith('/') ? pathOnly.startsWith(prefix) : pathOnly === prefix
  );
  if (!licensed) {
    return { ok: false, reason: 'not-allowlisted' };
  }

  return { ok: true, path: raw };
}
