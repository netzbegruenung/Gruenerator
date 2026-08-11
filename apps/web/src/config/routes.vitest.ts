import { describe, expect, it } from 'vitest';

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
});
