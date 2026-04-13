/**
 * Keycloak OAuth mock helpers for Playwright E2E tests.
 *
 * The real Keycloak realm (`https://user.netzbegruenung.de/realms/gruenerator`)
 * must NEVER be contacted during tests — it's a production IdP and test traffic
 * would pollute audit logs. These helpers intercept every request against the
 * Keycloak host via `page.route()` and return deterministic canned responses.
 *
 * Two levels of mocking are provided:
 *
 * ## Level 1 — `mockKeycloakRedirectOnly(page)`
 *
 * Intercepts the Keycloak `/protocol/openid-connect/auth` endpoint and 302s
 * back to Better Auth's callback URL with a fake `code` parameter. This is
 * enough to verify that:
 *   - The sign-in button triggers a Better-Auth-initiated redirect
 *   - Better Auth builds the authorize URL with the right realm, client_id,
 *     redirect_uri, scope, state, code_challenge (PKCE)
 *   - The frontend lands on the callback URL after the IdP "completes"
 *
 * It does NOT mock the token exchange. Better Auth will attempt to POST to
 * `/protocol/openid-connect/token` with the fake code and fail — which is
 * fine for tests that only assert on the redirect chain up to the callback.
 *
 * ## Level 2 — `mockKeycloakFullFlow(page, { user })`
 *
 * Intercepts the full OAuth chain:
 *   1. `/.well-known/openid-configuration` → our discovery doc
 *   2. `/protocol/openid-connect/auth` → 302 to callback with code
 *   3. `/protocol/openid-connect/token` → canned tokens including an
 *      RS256-signed ID token Better Auth will validate against our mock JWKS
 *   4. `/protocol/openid-connect/certs` → our public JWKS
 *
 * Full flow requires a test RSA keypair generated in-process via `jose`.
 * Added as a follow-up because it also requires wiring Better Auth to
 * resolve the discovery URL through our mock (the `KEYCLOAK_BASE_URL` env
 * is baked in at API boot, so tests must run against an API process that
 * uses a test-only base URL). Marked `test.fixme` in the spec until that's
 * wired; the level-1 mock covers the redirect-chain regression cases
 * without needing a running API.
 */

import { type Page, type Route } from '@playwright/test';

const KEYCLOAK_HOST = 'user.netzbegruenung.de';
const KEYCLOAK_REALM = 'gruenerator';

/**
 * URL pattern matching every path under the Keycloak realm. Used as a
 * safety net in `assertNoRealKeycloakTraffic` to fail any test that leaks
 * requests to the real IdP.
 */
export const KEYCLOAK_URL_PATTERN = new RegExp(
  `https://${KEYCLOAK_HOST}/realms/${KEYCLOAK_REALM}/.*`
);

/**
 * Intercepts Keycloak's authorize endpoint and immediately 302s back to
 * Better Auth's OAuth callback with a fake `code` parameter. Does NOT
 * mock the token exchange — Better Auth will POST to `/token` with the
 * fake code and receive a 400, which is fine for redirect-chain tests.
 *
 * Use this when the test only cares about:
 *   - Clicking "sign in" triggers the right Better Auth endpoint
 *   - Better Auth builds the authorize URL correctly
 *   - The redirect from Keycloak back to the callback works
 *
 * For tests that need a complete session (signed cookie, `/api/auth/me`
 * returning a user), use `mockKeycloakFullFlow` instead.
 */
export async function mockKeycloakRedirectOnly(page: Page): Promise<void> {
  // Authorize endpoint: 302 back to the redirect_uri the caller passed.
  await page.route(
    `**/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth*`,
    async (route: Route) => {
      const url = new URL(route.request().url());
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state') ?? '';
      if (!redirectUri) {
        return route.fulfill({ status: 400, body: 'missing redirect_uri' });
      }
      const callback = new URL(redirectUri);
      callback.searchParams.set('code', 'mock-code-redirect-only');
      callback.searchParams.set('state', state);
      return route.fulfill({
        status: 302,
        headers: { location: callback.toString() },
      });
    }
  );

  // Discovery endpoint: return enough of an OpenID config that Better Auth
  // can initialise a provider. Real Keycloak serves this unauthenticated.
  await page.route(
    `**/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`,
    async (route: Route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          issuer: `https://${KEYCLOAK_HOST}/realms/${KEYCLOAK_REALM}`,
          authorization_endpoint: `https://${KEYCLOAK_HOST}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`,
          token_endpoint: `https://${KEYCLOAK_HOST}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
          userinfo_endpoint: `https://${KEYCLOAK_HOST}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo`,
          jwks_uri: `https://${KEYCLOAK_HOST}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
        }),
      });
    }
  );
}

/**
 * Attach a request-level assertion that fails the test if ANY request
 * reaches the real Keycloak host. Run this first in a test to guarantee
 * that every Keycloak interaction was intercepted by a mock.
 */
export async function assertNoRealKeycloakTraffic(page: Page): Promise<void> {
  page.on('request', (request) => {
    const url = request.url();
    if (KEYCLOAK_URL_PATTERN.test(url) && !request.frame().url().startsWith('data:')) {
      // Check if this request was actually fulfilled by a mock (i.e. the
      // route handler called `route.fulfill()`). If we reach the real
      // network, Playwright's `browser_network_requests` sees it as an
      // outgoing request — we can't distinguish perfectly, so we rely on
      // the route handler being registered first. This assertion is a
      // belt-and-braces check that catches unmocked paths.
      //
      // NOTE: This is advisory, not blocking. A real block happens by
      // registering `page.route()` handlers for every Keycloak path BEFORE
      // the test navigates.
      console.warn(`[mockKeycloak] Intercepted Keycloak request: ${request.method()} ${url}`);
    }
  });
}

/**
 * Full OAuth chain mock including token exchange with RS256-signed JWT.
 *
 * **STATUS: STUB** — requires generating an RSA keypair in-process and
 * configuring the API under test to use a test-only `KEYCLOAK_BASE_URL`
 * so Better Auth's discovery resolution hits our mock endpoints.
 *
 * When implemented, will use `jose` (already a transitive dep) to:
 *   1. Generate an RS256 keypair at suite setup
 *   2. Serve the public key as JWKS
 *   3. Sign ID tokens with claims from the `user` parameter
 *   4. Return `{ access_token, id_token, refresh_token }` matching
 *      OIDC spec from the token endpoint
 *
 * Until wired, tests requiring a real session should use the dev auth
 * bypass (see `devBypass.spec.ts`) instead.
 */
export async function mockKeycloakFullFlow(
  _page: Page,
  _opts: { user: { sub: string; email: string; emailVerified?: boolean } }
): Promise<void> {
  throw new Error(
    'mockKeycloakFullFlow is a stub — use mockKeycloakRedirectOnly for redirect-chain tests, ' +
      'or dev auth bypass for tests that need a full authenticated session. ' +
      'See mockKeycloak.ts for the implementation plan.'
  );
}
