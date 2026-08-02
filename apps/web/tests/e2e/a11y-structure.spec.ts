/**
 * Struktur-Regression über ARIA-Snapshots.
 *
 * Ergänzt `a11y.spec.ts`: axe prüft Regeln, dieser Test prüft die *Gestalt* des
 * Accessibility-Trees. Der Unterschied ist der Grund, warum es beide gibt —
 * eine Seite kann null axe-Verstöße haben und trotzdem eine zerlegte
 * Überschriftenhierarchie oder verschwundene Landmarks haben. Genau das fällt
 * bei Refactorings an und genau das meldet kein Regelsatz.
 *
 * Bewusst nur auf `<main>` und nur auf Routen, die NICHT von Nutzerdaten
 * abhängen. Die Sidebar ändert sich mit Projekten und Grüneratoren, und
 * `/workplace`, `/boards`, `/documents` rendern Listen aus der Datenbank — ein
 * Snapshot darüber wäre bei jedem Datenwechsel rot. Dieselbe Varianz ist im
 * Baseline-Lauf gemessen worden (782 vs. 834 Vorkommen zwischen zwei Läufen
 * derselben Fassung, praktisch vollständig aus `/boards`).
 *
 * Datengetriebene Routen kommen dazu, sobald ein fixierter Datenstand steht
 * (Seed oder MSW) — siehe docs/barrierefreiheit-baseline-2026-08.md §8.
 *
 * Snapshots aktualisieren, wenn die Änderung gewollt ist:
 *   pnpm --filter @gruenerator/web exec playwright test a11y-structure --update-snapshots
 *
 * Vorher lesen, was sich geändert hat. Ein Snapshot, der ungeprüft neu
 * geschrieben wird, prüft nichts mehr.
 */

import { test, type Page } from '@playwright/test';

import { isDevBypassHonored } from './fixtures/pageHelpers.js';

const API_BASE = process.env.E2E_API_BASE_URL ?? 'http://localhost:3001';
const BYPASS_TOKEN = process.env.DEV_AUTH_BYPASS_TOKEN;

// `/settings` fehlt bewusst: die Route rendert die Workplace-Oberfläche und legt
// die Einstellungen als Dialog darüber — `main` enthält dort also den
// datengetriebenen Arbeitsplatz, nicht die Einstellungen. Ein Snapshot davon
// misst das Falsche und flackert mit den Nutzerdaten.
const ROUTES = ['/login', '/apps', '/suche'];

async function gotoAuthenticated(page: Page, route: string): Promise<void> {
  if (BYPASS_TOKEN) {
    await page.setExtraHTTPHeaders({ 'x-dev-auth-bypass': BYPASS_TOKEN });
  }
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  // Auf Inhalt warten, nicht auf die Uhr: `/settings` lädt seine Tabs nach und
  // lieferte mit fester Wartezeit einen LEEREN Snapshot, der beim nächsten Lauf
  // prompt abwich. Ein Snapshot von nichts sieht grün aus und prüft nichts.
  await page
    .locator('main')
    .first()
    .locator(':scope :is(h1, h2, button, a, input)')
    .first()
    .waitFor({ state: 'attached', timeout: 15_000 });
  await page.waitForTimeout(1000);
}

test.describe('Accessibility-Tree bleibt stabil', () => {
  test.beforeAll(async ({ request }) => {
    const honored = await isDevBypassHonored(request, API_BASE, BYPASS_TOKEN);
    test.skip(!honored, 'Dev-Auth-Bypass nicht aktiv.');
  });

  for (const route of ROUTES) {
    test(`${route}`, async ({ page }) => {
      await gotoAuthenticated(page, route);
      await test
        .expect(page.locator('main').first())
        .toMatchAriaSnapshot({ name: `${route.replace(/\//g, '_') || '_root'}.aria.yml` });
    });
  }
});
