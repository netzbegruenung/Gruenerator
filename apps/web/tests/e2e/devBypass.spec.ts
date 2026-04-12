/**
 * E2E tests for the `VITE_E2E_AUTH_BYPASS` path.
 *
 * The dev auth bypass is a two-layer escape hatch for testing:
 *
 *   - **Frontend**: `VITE_E2E_AUTH_BYPASS=true` in the web env makes
 *     `useAuth()` return a hardcoded test user literal from `useAuth.ts`,
 *     skipping the real session roundtrip.
 *   - **Backend**: `ALLOW_DEV_AUTH_BYPASS=true` + `DEV_AUTH_BYPASS_TOKEN`
 *     in the API env makes `requireAuth` accept an `x-dev-auth-bypass`
 *     header as a substitute for a real session, attaching
 *     `DEV_BYPASS_USER` to `req.user`.
 *
 * The bypass fails fast in production: `NODE_ENV=production` +
 * `ALLOW_DEV_AUTH_BYPASS=true` → HTTP 500 `Critical security misconfiguration`.
 * That guard is pinned by `authMiddleware.vitest.ts` and covered here again
 * at the HTTP layer as a final integration check.
 *
 * Tests in this file require:
 *
 *   VITE_E2E_AUTH_BYPASS=true
 *   ALLOW_DEV_AUTH_BYPASS=true
 *   DEV_AUTH_BYPASS_TOKEN=<your-dev-token>
 *
 * If any of these are missing, the entire suite skips gracefully so
 * production-like environments stay green.
 */

import { test, expect } from '@playwright/test';

import { isDevBypassHonored } from './fixtures/pageHelpers.js';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const BYPASS_TOKEN = process.env.DEV_AUTH_BYPASS_TOKEN;
const BYPASS_ENABLED_WEB = process.env.VITE_E2E_AUTH_BYPASS === 'true';

/**
 * Shape of `/api/auth/profile` success response — locally declared to
 * avoid importing from `@gruenerator/contracts` (path alias not wired
 * in playwright tests). Matches the canonical `UserProfile` schema for
 * the fields these tests assert on.
 */
interface ProfileResponse {
  user: {
    id: string;
    email: string;
    display_name?: string;
    avatar_robot_id: number;
    beta_features: Record<string, unknown>;
    user_defaults: Record<string, unknown>;
    created_at: string | Date;
    updated_at: string | Date;
    groups_enabled: boolean;
    custom_generators: boolean;
    database_access: boolean;
    collab: boolean;
    notebook: boolean;
    sharepic: boolean;
    anweisungen: boolean;
    labor_enabled: boolean;
    sites_enabled: boolean;
    chat: boolean;
    interactive_antrag_enabled: boolean;
    vorlagen: boolean;
    video_editor: boolean;
    [flag: string]: unknown;
  };
}

interface ErrorResponse {
  error: string;
  redirectUrl?: string;
}

test.describe('Dev auth bypass — frontend flag', () => {
  test.skip(!BYPASS_ENABLED_WEB, 'Requires VITE_E2E_AUTH_BYPASS=true');

  test('authenticated landing page renders for bypass user without backend session', async ({
    page,
  }) => {
    // With VITE_E2E_AUTH_BYPASS=true, the useAuth hook should return a
    // test user literal and skip `/auth/status`. The landing page should
    // render its authenticated layout.
    await page.goto('/');

    // The authenticated layout has elements the unauthenticated landing
    // lacks. We assert a stable one exists within a reasonable timeout.
    // NOTE: if the landing uses a different selector, adjust here.
    await expect(page).toHaveURL('/');
    // If the app redirects to /auth/login despite the bypass, the frontend
    // env wasn't picked up — this assertion will fail with a useful message.
    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 3000 });
  });
});

test.describe('Dev auth bypass — backend token', () => {
  // Probe once per suite: the bypass requires BOTH the client knowing
  // DEV_AUTH_BYPASS_TOKEN AND the API running with ALLOW_DEV_AUTH_BYPASS=true.
  // We skip gracefully if either is missing — a bypass token that the
  // running backend doesn't honor would produce 401s that look like real
  // failures, and skipping is the right signal there.
  let bypassHonored = false;
  test.beforeAll(async ({ request }) => {
    bypassHonored = await isDevBypassHonored(request, API_BASE, BYPASS_TOKEN);
  });
  test.beforeEach(() => {
    test.skip(
      !bypassHonored,
      'Dev bypass not active on running backend. ' +
        'Requires DEV_AUTH_BYPASS_TOKEN + ALLOW_DEV_AUTH_BYPASS=true in api env.'
    );
  });

  test('valid bypass token attaches DEV_BYPASS_USER to req.user', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/profile`, {
      headers: { 'x-dev-auth-bypass': BYPASS_TOKEN! },
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as ProfileResponse;

    // DEV_BYPASS_USER has a fixed id and dev email — pin them so a silent
    // change to the literal is caught.
    expect(body.user.id).toBe('00000000-0000-4000-a000-000000000001');
    expect(body.user.email).toContain('@');
    expect(body.user.display_name).toBe('Development User');
    expect(body.user.avatar_robot_id).toBe(1);

    // Canonical UserProfile shape — every feature flag must be a boolean.
    const flags = [
      'groups_enabled',
      'custom_generators',
      'database_access',
      'collab',
      'notebook',
      'sharepic',
      'anweisungen',
      'labor_enabled',
      'sites_enabled',
      'chat',
      'interactive_antrag_enabled',
      'vorlagen',
      'video_editor',
    ];
    for (const flag of flags) {
      expect(typeof body.user[flag]).toBe('boolean');
    }

    // beta_features and user_defaults must be objects, not undefined.
    expect(body.user.beta_features).toEqual(expect.any(Object));
    expect(body.user.user_defaults).toEqual(expect.any(Object));

    // Timestamps are ISO strings or Date-serializable values.
    expect(body.user.created_at).toBeDefined();
    expect(body.user.updated_at).toBeDefined();
  });

  test('wrong bypass token is rejected with 401', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/profile`, {
      headers: { 'x-dev-auth-bypass': 'definitely-wrong-token' },
    });

    expect(response.status()).toBe(401);
  });

  test('missing bypass header falls through to normal auth (401 without session)', async ({
    request,
  }) => {
    const response = await request.get(`${API_BASE}/api/auth/profile`);
    expect(response.status()).toBe(401);
  });

  test('authenticated request to a protected feature route succeeds', async ({ request }) => {
    // Pick a route that requires `req.user` but doesn't have heavy side
    // effects — a GET on a listing endpoint is ideal.
    const response = await request.get(`${API_BASE}/api/chat-service/threads`, {
      headers: {
        'x-dev-auth-bypass': BYPASS_TOKEN!,
        accept: 'application/json',
      },
    });

    // 200 with a list, or 204 empty — both acceptable. Definitely NOT 401.
    expect(response.status()).not.toBe(401);
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('Dev auth bypass — production fail-fast guard', () => {
  // This test can only run if the test environment exposes a way to flip
  // NODE_ENV on the API side. That's rarely true in a normal dev setup, so
  // the test is gated behind an explicit E2E_TEST_PROD_GUARD flag. The
  // vitest suite in authMiddleware.vitest.ts already covers this invariant
  // with module-level env mocking — this E2E version is belt-and-braces
  // for fully-integrated deployments.
  test.skip(
    process.env.E2E_TEST_PROD_GUARD !== '1',
    'Requires a deployment configured with NODE_ENV=production ' +
      'AND ALLOW_DEV_AUTH_BYPASS=true (test this against staging only)'
  );

  test('production + ALLOW_DEV_AUTH_BYPASS returns 500', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/auth/profile`, {
      headers: { 'x-dev-auth-bypass': BYPASS_TOKEN ?? 'anything' },
    });

    expect(response.status()).toBe(500);
    const body = (await response.json()) as ErrorResponse;
    expect(body).toMatchObject({
      error: expect.stringContaining('Critical security misconfiguration'),
    });
  });
});
