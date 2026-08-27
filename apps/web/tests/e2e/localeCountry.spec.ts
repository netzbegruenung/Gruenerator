/**
 * E2E für die Ländererkennung beim Login und die Nachfrage danach.
 *
 * Der gemessene Bug steckt im ersten Test: ein Gerät in Wien, dessen Browser
 * `de-DE` meldet. Genau so sind österreichische Mitglieder bisher auf dem
 * deutschen IdP gelandet — die alte Erkennung fragte `navigator.language`, und
 * Österreich spricht Deutsch. Playwright kann Zeitzone und Sprache pro Kontext
 * setzen, deshalb ist das hier direkt prüfbar.
 *
 * Beide Blöcke laufen ohne Backend: die Erkennung ist reines Client-Verhalten,
 * und die Sitzung des Gate-Blocks wird per `page.route()` gestellt. Keycloak
 * wird nie kontaktiert.
 */

import { test, expect, type Page, type Route } from '@playwright/test';

import { preSeedCookieConsent } from './fixtures/pageHelpers.js';

/** Die Sitzungsantwort, aus der `useAuth` sein Profil baut. */
function sessionRoute(user: Record<string, unknown>) {
  return async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          id: 'sess-e2e',
          userId: user.id,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        },
        user,
      }),
    });
  };
}

const BASE_USER = {
  id: 'user-e2e-locale',
  email: 'testperson@example.org',
  name: 'Testperson',
  emailVerified: true,
  image: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  avatar_robot_id: 1,
  beta_features: {},
  user_defaults: {},
  // Das Einwilligungs-Gate hat Vorrang; ohne dieses Datum stünde es vor dem
  // Länder-Dialog und die Zusicherungen unten liefen ins Leere.
  ai_consent_at: '2026-01-01T00:00:00.000Z',
};

async function gotoLogin(page: Page) {
  await preSeedCookieConsent(page);
  await page.goto('/login');
}

test.describe('Ländererkennung vor dem Login', () => {
  test.describe('österreichisches Gerät mit deutschsprachigem Browser', () => {
    test.use({ timezoneId: 'Europe/Vienna', locale: 'de-DE' });

    test('schlägt Österreich vor, obwohl die Browsersprache de-DE ist', async ({ page }) => {
      await gotoLogin(page);

      const anmelden = page.getByRole('button', { name: /^Anmelden mit/ });
      await expect(anmelden).toBeVisible();
      await expect(anmelden).toHaveAccessibleName(/Grüne Alternative/);
    });
  });

  test.describe('deutsches Gerät', () => {
    test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });

    test('schlägt Deutschland vor', async ({ page }) => {
      await gotoLogin(page);

      const anmelden = page.getByRole('button', { name: /^Anmelden mit/ });
      await expect(anmelden).toBeVisible();
      await expect(anmelden).toHaveAccessibleName(/Grünes Netz/);
    });
  });

  test.describe('unklares Signal', () => {
    test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

    test('fragt nach dem Land, statt eines stillschweigend zu wählen', async ({ page }) => {
      await gotoLogin(page);

      await expect(page.getByText('In welchem Land bist du grün aktiv?')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Deutschland' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Österreich' })).toBeVisible();
      // Kein ratender Sammelknopf daneben — das war der stille DE-Pfad.
      await expect(page.getByRole('button', { name: /^Anmelden mit/ })).toHaveCount(0);
    });
  });
});

test.describe('Länderfrage nach dem Login', () => {
  test.use({ timezoneId: 'Europe/Berlin', locale: 'de-DE' });

  test('erscheint, wenn das Profil kein Land trägt', async ({ page }) => {
    await page.route('**/api/auth/v2/get-session*', sessionRoute(BASE_USER));
    await preSeedCookieConsent(page);
    await page.goto('/start');

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('In welchem Land bist Du grün aktiv?')).toBeVisible();

    // Wegklicken ist keine Antwort: der Dialog überlebt Escape.
    await page.keyboard.press('Escape');
    await expect(dialog.getByText('In welchem Land bist Du grün aktiv?')).toBeVisible();
  });

  test('schickt die Wahl an den Server und verschwindet', async ({ page }) => {
    await page.route('**/api/auth/v2/get-session*', sessionRoute(BASE_USER));

    let sentLocale: string | null = null;
    await page.route('**/api/auth/locale', async (route) => {
      const body = route.request().postDataJSON() as { locale?: string } | null;
      sentLocale = body?.locale ?? null;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, locale: sentLocale, message: 'ok' }),
      });
    });

    await preSeedCookieConsent(page);
    await page.goto('/start');

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /Österreich/ }).click();

    await expect
      .poll(() => sentLocale, { message: 'PUT /auth/locale wurde nicht abgesetzt' })
      .toBe('de-AT');
    await expect(dialog.getByText('In welchem Land bist Du grün aktiv?')).toHaveCount(0);
  });

  test('erscheint nicht, wenn das Land bekannt ist', async ({ page }) => {
    await page.route(
      '**/api/auth/v2/get-session*',
      sessionRoute({ ...BASE_USER, locale: 'de-AT' })
    );
    await preSeedCookieConsent(page);
    await page.goto('/start');

    await expect(page.getByText('In welchem Land bist Du grün aktiv?')).toHaveCount(0);
  });
});
