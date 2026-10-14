import { describe, expect, it } from 'vitest';

import { isPublicPage } from '../utils/authRedirect';

import { routes } from './routes';

/**
 * The auth model lives in exactly one place: a route is login-only unless it
 * carries `public: true`, and `App.tsx` wraps everything else in `RequireAuth`.
 * That default-deny only holds as long as the opt-out list stays deliberate —
 * a single `public: true` slipped into a PR silently un-gates a page and
 * nothing else in the build notices.
 *
 * So the list is pinned here. A new entry is not a test failure to be silenced:
 * update this array only together with a reviewer who agrees the page may be
 * served to anonymous visitors.
 */
const EXPECTED_PUBLIC_PATHS = [
  // Marketing start page (authenticated users get redirected to /workplace).
  '/',
  '/startseite',
  '/testsommer',
  // Shared-by-token resources — the token is the credential.
  '/subtitler/share/:shareToken',
  '/share/:shareToken',
  '/boards/public/:id',
  // Explainable share link. The token answers 404 while private and 401 for a
  // login-gated link, so anonymous visitors only read deliberately public ones.
  '/e/:token',
  // A Vorlage whose owner set share_mode='public'. The id is the credential:
  // the endpoint behind it answers 401 for a login-gated link and 404 for a
  // private one, so an anonymous visitor only ever sees a Vorlage that was
  // deliberately opened. The page shows title, blurb and preview — making a
  // copy still needs an account.
  '/vorlagen/v/:id',
  // Legally required to be reachable without an account.
  '/datenschutz',
  '/impressum',
  '/support',
  '/nutzungsbedingungen',
  '/ki-transparenz',
  // Auth UI itself.
  '/login',
  '/register',
  '/sites/login',
  // 404 — anonymous visitors get "not found" instead of a login bounce.
  '*',
];

describe('route auth gating', () => {
  it('exposes exactly the reviewed set of public routes', () => {
    const publicPaths = routes.filter((r) => r.public).map((r) => r.path);

    expect([...publicPaths].sort()).toEqual([...EXPECTED_PUBLIC_PATHS].sort());
  });

  it('defaults every other route to the auth gate', () => {
    const gated = routes.filter((r) => !r.public);

    expect(gated.length).toBeGreaterThan(50);
    expect(gated.some((r) => EXPECTED_PUBLIC_PATHS.includes(r.path))).toBe(false);
  });

  // The 401 handler in apiClient decides "redirect to /login or stay" via
  // `isPublicPage`, a hand-kept list separate from the `public` flag above.
  // When the two drift, a guest on a public page who triggers any login-only
  // request gets bounced to /login and reported as a session teardown,
  // although there never was a session (GlitchTip 673, /ki-transparenz).
  it('keeps a guest on every public route when a request answers 401', () => {
    const concrete = routes
      .filter((r) => r.public && r.path !== '*')
      .map((r) => r.path.replace(/:[^/]+/g, 'x').replace(/\*$/, 'x'));

    expect(concrete.filter((path) => !isPublicPage(path))).toEqual([]);
  });
});
