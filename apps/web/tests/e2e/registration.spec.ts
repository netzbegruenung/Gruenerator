/**
 * E2E tests for the registration landing page.
 *
 * **There is no separate registration flow in this app.** Keycloak manages
 * identity and auto-provisions a profile on first successful login — there
 * is no "fill out a form → submit → create account" step the user traverses
 * locally. The `/register` route is a UI shell with a single "Konto
 * erstellen" button that navigates to the same `/api/auth/login` endpoint
 * as `/login`, with `prompt=register` appended as a hint to Keycloak.
 *
 * Because of that, these tests cover the *UI-layer* contract only:
 *
 *   1. The `/register` page renders (regression protection for "we
 *      accidentally removed the route").
 *   2. The primary button exists, has the expected accessible name, and
 *      is not disabled on load.
 *   3. Clicking the button initiates a navigation to `/api/auth/login`
 *      with `prompt=register` in the query — proving the page is wired
 *      into the real auth flow and not a dead stub.
 *   4. The "already have an account?" cross-link points at `/login`.
 *   5. Legal disclosure links are present (DSGVO requirement).
 *
 * Verifying the full Keycloak → callback → session-cookie chain is
 * covered separately in `auth.spec.ts` and (once the full-flow mock is
 * implemented) in the Keycloak OAuth mock path — see
 * `fixtures/mockKeycloak.ts` for the status of `mockKeycloakFullFlow`.
 */

import { test, expect } from '@playwright/test';

import { mockKeycloakRedirectOnly } from './fixtures/mockKeycloak.js';
import { preSeedCookieConsent } from './fixtures/pageHelpers.js';

test.describe('Registration landing page (/register → Keycloak handoff)', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed cookie consent BEFORE navigation so the DSGVO banner never
    // renders and intercepts clicks on elements behind it.
    await preSeedCookieConsent(page);

    // Mock Keycloak at the network layer BEFORE navigating anywhere. This
    // ensures that if any test accidentally lets the button click reach the
    // real IdP, our mock intercepts instead of polluting production logs.
    await mockKeycloakRedirectOnly(page);
  });

  test('renders the registration UI with all expected elements', async ({ page }) => {
    await page.goto('/register');

    // Page headline confirms we're on the right route.
    await expect(page.getByRole('heading', { name: 'Registrierung' })).toBeVisible();

    // The primary action button (Gendered language per project convention).
    const registerButton = page.getByRole('button', { name: /Konto erstellen/i });
    await expect(registerButton).toBeVisible();
    await expect(registerButton).toBeEnabled();

    // Cross-link to login page.
    const loginLink = page.getByRole('link', { name: 'Hier anmelden' });
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute('href', '/login');

    // Legal disclosure — required for DSGVO compliance on the registration page.
    // Scope to <main> because the footer also renders a "Nutzungsbedingungen"
    // link to the legacy `/nutzungsbedingungen` route, which would trip a
    // strict-mode locator violation.
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: 'Nutzungsbedingungen' })).toHaveAttribute(
      'href',
      '/legal/terms'
    );
    await expect(main.getByRole('link', { name: 'Datenschutzerklärung' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
  });

  test('clicking "Konto erstellen" initiates navigation to Better Auth login endpoint', async ({
    page,
  }) => {
    await page.goto('/register');

    // Intercept the Better Auth login redirect so we don't actually hit the
    // backend. We only care that the button triggers navigation toward
    // `/api/auth/login` with `prompt=register` attached.
    let capturedAuthUrl: string | undefined;
    await page.route('**/api/auth/login*', async (route) => {
      capturedAuthUrl = route.request().url();
      // Abort so the browser doesn't follow the redirect and crash the test
      // on the (unreachable) backend.
      await route.abort('blockedbyclient');
    });

    await page.getByRole('button', { name: /Konto erstellen/i }).click();

    // Give the navigation a moment to fire, then assert.
    await expect.poll(() => capturedAuthUrl).toContain('/api/auth/login');
    expect(capturedAuthUrl).toContain('prompt=register');
  });

  test('login cross-link navigates to /login', async ({ page }) => {
    await page.goto('/register');

    await page.getByRole('link', { name: 'Hier anmelden' }).click();

    // The login page should be accessible (may redirect through auth guard,
    // but the URL should settle on `/login` or the auth flow entry point).
    await expect(page).toHaveURL(/\/login/);
  });

  // NOTE: there used to be a "disables the button after click to prevent
  // double-submit" test here. It was removed because RegistrationPage uses
  // `window.location.href = ...` which triggers a full-page unload — the
  // button element is torn down before the assertion can observe the
  // disabled state, and the test was structurally racy. The double-submit
  // guarantee is still defensible at the component level (the button
  // ignores further clicks during unload) but isn't a good E2E target.
});
