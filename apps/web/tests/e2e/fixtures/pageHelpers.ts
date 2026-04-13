/**
 * Shared per-test helpers for Playwright E2E.
 *
 * Every spec file should call `setupPage(page)` in `beforeEach` to get a
 * consistent starting state: cookie banner dismissed, unrelated side
 * effects quieted. Without this, the DSGVO cookie banner can intercept
 * clicks on elements behind it and tests time out with "element is
 * covered by another element".
 */

import { type APIRequestContext, type Page } from '@playwright/test';

/**
 * Dismiss the DSGVO cookie consent banner if it's showing.
 *
 * The banner renders on first load for every visitor and localStorage
 * remembers the choice. Playwright's isolated browser context starts
 * with empty storage each test, so we either pre-populate the consent
 * key or click "Nur Notwendige" after navigation. Click is more honest
 * (tests the real page) but slower; the localStorage shortcut is what
 * we use for specs that don't care about the banner itself.
 *
 * Call this AFTER the page has navigated. Safe to call if the banner
 * isn't present — the `.catch(() => {})` pattern swallows the miss.
 */
export async function dismissCookieBanner(page: Page): Promise<void> {
  // Try clicking "Nur Notwendige" first — matches the real user path.
  // 1s timeout because the banner usually renders within the first frame.
  await page
    .getByRole('button', { name: /Nur Notwendige|Alle akzeptieren/i })
    .first()
    .click({ timeout: 1000 })
    .catch(() => {
      // Banner not visible — either already dismissed or a variant route
      // doesn't render it. Either way, safe to proceed.
    });
}

/**
 * Pre-seed the cookie consent in localStorage so the banner never renders.
 * Use in `beforeEach` before `page.goto()` to avoid the post-navigation
 * click race entirely.
 *
 * The key name should match whatever the cookie-banner component uses
 * — check `apps/web/src/components/...` for the real key if this starts
 * failing after a banner refactor.
 */
export async function preSeedCookieConsent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Cover a few common variants since the exact key may drift.
    try {
      localStorage.setItem('cookie-consent', 'necessary');
      localStorage.setItem('gruenerator_cookie_consent', 'necessary');
      localStorage.setItem('cookieConsent', JSON.stringify({ status: 'necessary' }));
    } catch {
      // SSR or storage blocked — ignore
    }
  });
}

/**
 * Probe the API base URL once per suite and return whether it's reachable.
 * Used by `test.skip(!apiReachable, ...)` to gracefully skip API-dependent
 * tests when the api dev server isn't running alongside the web dev server.
 *
 * Returns a cached boolean so each test file pays at most one HTTP roundtrip.
 *
 * Uses Better Auth's `/api/auth/v2/get-session` as the probe — it always
 * returns 200 (with an empty session body for unauthenticated callers) and
 * is guaranteed to exist whenever the API is up. Don't use
 * `/api/auth/profile` or similar because those 401 without a session, and
 * deliberately-401 responses look identical to a 401 from a broken API.
 */
export async function isApiReachable(
  request: APIRequestContext,
  baseUrl: string
): Promise<boolean> {
  try {
    const response = await request.get(`${baseUrl}/api/auth/v2/get-session`, {
      timeout: 2000,
      failOnStatusCode: false,
    });
    return response.status() < 500;
  } catch {
    return false;
  }
}

/**
 * Probe whether the dev auth bypass is actually honored by the running API.
 *
 * The bypass requires THREE things to be true simultaneously:
 *   1. The client knows `DEV_AUTH_BYPASS_TOKEN` (set in this process's env)
 *   2. The API was started with `ALLOW_DEV_AUTH_BYPASS=true`
 *   3. The API's `env.DEV_AUTH_BYPASS_TOKEN` matches the client's token
 *
 * This helper sends the header to `/api/auth/profile` and checks whether
 * the response is 200 (bypass honored → tests can run) or 401 (bypass off
 * OR wrong token → tests skip).
 *
 * More reliable than `test.skip(!process.env.DEV_AUTH_BYPASS_TOKEN)` because
 * the token being *known* to the test process says nothing about whether
 * the API backend is actually honoring it.
 */
export async function isDevBypassHonored(
  request: APIRequestContext,
  baseUrl: string,
  token: string | undefined
): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await request.get(`${baseUrl}/api/auth/profile`, {
      headers: { 'x-dev-auth-bypass': token },
      timeout: 2000,
      failOnStatusCode: false,
    });
    return response.status() === 200;
  } catch {
    return false;
  }
}
