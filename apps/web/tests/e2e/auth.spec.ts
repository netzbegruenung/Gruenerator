/**
 * E2E tests for authentication state and protected routes.
 *
 * Covers the security-critical parts of the auth surface that live in the
 * browser — request behavior for unauthenticated users, 401 responses for
 * protected API routes, and login/logout state transitions.
 *
 * These tests never contact real Keycloak. Where a "logged in" state is
 * needed, the dev auth bypass is used (see `devBypass.spec.ts` for the
 * detailed happy-path coverage).
 */

import { test, expect } from '@playwright/test';

import { mockKeycloakRedirectOnly } from './fixtures/mockKeycloak.js';
import {
  isApiReachable,
  isDevBypassHonored,
  preSeedCookieConsent,
} from './fixtures/pageHelpers.js';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';

interface ErrorResponse {
  error: string;
  redirectUrl?: string;
}

interface ProfileResponse {
  user: {
    id: string;
    email: string;
    display_name?: string;
    avatar_robot_id: number;
    beta_features: Record<string, unknown>;
    user_defaults: Record<string, unknown>;
    groups_enabled: boolean;
    chat: boolean;
    [flag: string]: unknown;
  };
}

test.describe('Authentication — unauthenticated access', () => {
  // Probe the API once before these tests run. If the API isn't reachable
  // (common when running `pnpm test:e2e` without `pnpm dev:backend` in
  // parallel), skip the whole describe block gracefully instead of timing
  // out on every test for 30s each.
  let apiUp = false;
  test.beforeAll(async ({ request }) => {
    apiUp = await isApiReachable(request, API_BASE);
  });
  test.beforeEach(async ({ page }) => {
    test.skip(!apiUp, `API at ${API_BASE} is not reachable — start pnpm dev:backend`);
    await preSeedCookieConsent(page);
    await mockKeycloakRedirectOnly(page);
  });

  test('GET /api/auth/profile without session returns 401 with JSON error', async ({ request }) => {
    // `/api/auth/profile` is the authenticated profile endpoint gated by
    // `requireAuth`. It's distinct from `/api/auth/me` (unauthenticated
    // cache logger) and from `/api/auth/v2/get-session` (Better Auth's
    // public session read). This test pins the `requireAuth` 401 contract.
    const response = await request.get(`${API_BASE}/api/auth/profile`);

    expect(response.status()).toBe(401);
    const body = (await response.json()) as ErrorResponse;
    expect(body).toMatchObject({
      error: expect.stringContaining('Authentication required'),
      redirectUrl: '/auth/login',
    });
  });

  test('GET /api/chat-service/threads without session returns 401 with redirectUrl', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/chat-service/threads`, {
      headers: { accept: 'application/json' },
    });

    expect(response.status()).toBe(401);
    const body = (await response.json()) as ErrorResponse;
    // The 401 body must include `redirectUrl` so the SPA knows where to
    // send the user. This is the contract requireAuth() ships.
    expect(body).toMatchObject({
      error: expect.any(String),
      redirectUrl: '/auth/login',
    });
  });

  test('unauthenticated SPA route shows in-page login modal (not URL redirect)', async ({
    page,
  }) => {
    // This app uses a modal-overlay pattern for protected routes, NOT a
    // URL redirect: visiting `/gruppen` without a session renders the
    // `/gruppen` route but overlays a login prompt on top of the feature
    // page. The URL stays put; the login prompt is in <main> with a close
    // button and IdP login buttons.
    //
    // Pinning this behavior is valuable because it's the behavior users
    // actually see — silently changing to a redirect would be a visible
    // regression.
    await page.goto('/gruppen', { waitUntil: 'domcontentloaded' });

    // URL should stay on the protected route (no redirect).
    await expect(page).toHaveURL(/\/gruppen$/);

    // Login overlay content should be visible — asserts on the German
    // prompt copy that the modal renders for unauthenticated visitors.
    await expect(page.getByText(/Melde dich an.*Gruppen zu nutzen/i).first()).toBeVisible({
      timeout: 5000,
    });

    // The overlay provides a close button — proves it's a modal, not the
    // main page content, and gives the user an escape hatch.
    await expect(page.getByRole('button', { name: /Login schließen/i })).toBeVisible();
  });
});

test.describe('Authentication — login navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockKeycloakRedirectOnly(page);
  });

  test('/login page renders without triggering real OAuth flow', async ({ page }) => {
    // Abort any outgoing navigation to /api/auth/login so the page can't
    // accidentally hit real Keycloak if it auto-redirects on mount.
    await page.route('**/api/auth/login*', (route) => route.abort('blockedbyclient'));

    await page.goto('/login');

    // Login page should render. Depending on the implementation this is
    // either an automatic redirect or a button; we just assert the page
    // loaded without errors. Click-to-redirect is covered by the
    // registration spec which follows the same flow.
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Authentication — session roundtrip via dev bypass', () => {
  // Probe the running backend instead of just env vars — bypass tokens that
  // the API doesn't actually honor would cause misleading 401 failures.
  let bypassHonored = false;
  test.beforeAll(async ({ request }) => {
    bypassHonored = await isDevBypassHonored(request, API_BASE, process.env.DEV_AUTH_BYPASS_TOKEN);
  });
  test.beforeEach(() => {
    test.skip(
      !bypassHonored,
      'Dev bypass not honored by running backend. ' +
        'Requires DEV_AUTH_BYPASS_TOKEN + ALLOW_DEV_AUTH_BYPASS=true in api env.'
    );
  });

  test('authenticated request returns typed UserProfile from /api/auth/profile', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/auth/profile`, {
      headers: {
        'x-dev-auth-bypass': process.env.DEV_AUTH_BYPASS_TOKEN!,
      },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as ProfileResponse;

    // The shape asserted here is the canonical UserProfile from
    // @gruenerator/contracts. Every field listed must be present on
    // the DEV_BYPASS_USER literal in apps/api/middleware/authMiddleware.ts.
    expect(body).toHaveProperty('user.id');
    expect(body).toHaveProperty('user.email');
    expect(body).toHaveProperty('user.display_name');
    expect(body).toHaveProperty('user.avatar_robot_id');
    expect(body).toHaveProperty('user.beta_features');
    expect(body).toHaveProperty('user.user_defaults');
    // Feature flags are all booleans in the canonical schema.
    expect(typeof body.user.groups_enabled).toBe('boolean');
    expect(typeof body.user.chat).toBe('boolean');
  });
});
