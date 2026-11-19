/**
 * Sites (candidate websites), in a real browser: the gate, the create flow, and
 * the public page as the renderer serves it.
 *
 * No backend: the bypass is client-side (`VITE_E2E_AUTH_BYPASS=true`, as in
 * `a11y.spec.ts`), the site routes are stubbed (`fixtures/sitesFixtures.ts`).
 * Unlike the other specs here, a missing bypass is NOT a skip when `CI` is set:
 * a green check that ran nothing is worse than a red one.
 *
 * Not covered: the editor itself. It needs a collaborative draft over
 * Hocuspocus, which this lane has no server for. Edit and publish therefore go
 * through the stubbed API (`PUT`, `POST …/publish`), not through the editor UI;
 * what the lane checks is that the page rendered from the published snapshot
 * carries the edit.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import AxeBuilder from '@axe-core/playwright';
import { type SupportedLocale } from '@gruenerator/contracts';
import { test, expect, type Page } from '@playwright/test';
import { type Spec } from 'axe-core';

import { installApiFixtures } from './fixtures/apiFixtures.js';
import {
  GENERATED,
  HANDLE,
  LEGAL,
  PUBLIC_ORIGIN,
  installPublicSite,
  installSitesApi,
  makeSite,
  publishFromDraft,
} from './fixtures/sitesFixtures.js';

const BYPASS_AKTIV = process.env.VITE_E2E_AUTH_BYPASS === 'true';

// Copied from a11y.spec.ts (WCAG_TAGS, PLATZHALTER_IST_KEIN_NAME, AXE_SOURCE); keep in sync.
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const PLATZHALTER_IST_KEIN_NAME: Spec = {
  checks: [{ id: 'non-empty-placeholder', enabled: false }],
};
const AXE_SOURCE = `${readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')}
;axe.configure(${JSON.stringify(PLATZHALTER_IST_KEIN_NAME)});`;

const wcagAxe = (page: Page) => new AxeBuilder({ page, axeSource: AXE_SOURCE }).withTags(WCAG_TAGS);

const DESCRIPTION =
  'Ich bin Anna Beispiel, Stadträtin in Musterstadt. Ich kandidiere für den Landtag und setze ' +
  'mich für Klimaschutz, bezahlbaren Wohnraum und bessere Bildung ein.';

test.describe('Sites: Zugang und Anlegen', () => {
  test.beforeEach(() => {
    if (BYPASS_AKTIV) return;
    const reason = 'VITE_E2E_AUTH_BYPASS ist nicht gesetzt.';
    if (process.env.CI) throw new Error(`${reason} Die Sites-Lane hätte nichts geprüft.`);
    test.skip(true, reason);
  });

  test('gate: not unlocked', async ({ page }) => {
    await installApiFixtures(page);
    installSitesApi(page, { unlocked: false });

    await page.goto('/start/arbeiten');
    const tools = page.locator('[data-tour="arbeiten-tools"]');
    await expect(tools.getByRole('link', { name: /Projekte/ })).toBeVisible();
    await expect(tools.getByRole('link', { name: /Sites/ })).toHaveCount(0);

    await page.keyboard.press('Control+k');
    const input = page.getByPlaceholder('Suchen …');
    await input.fill('marktplatz');
    await expect(page.getByRole('option', { name: /Marktplatz/ }).first()).toBeVisible();
    await input.fill('website');
    await expect(page.getByRole('option', { name: /Sites/ })).toHaveCount(0);

    await page.goto('/sites');
    await expect(page.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeVisible();
  });

  test('create, edit, publish, public page', async ({ page, context }) => {
    await installApiFixtures(page);
    const { state } = installSitesApi(page, { unlocked: true });
    await installPublicSite(context, state);

    await page.goto('/start/arbeiten');
    await page.locator('[data-tour="arbeiten-tools"]').getByRole('link', { name: /Sites/ }).click();
    await expect(page).toHaveURL(/\/sites$/);

    // Create: address, description, generated preview, create.
    await page.getByLabel('Adresse').fill(HANDLE);
    await expect(page.getByText('Diese Adresse ist frei')).toBeVisible();
    await page.getByRole('button', { name: /Weiter/ }).click();
    await page.locator('#description').fill(DESCRIPTION);
    await page.getByRole('button', { name: /Seite generieren/ }).click();
    await expect(page.getByText(GENERATED.hero.heading).first()).toBeVisible();
    await page.getByRole('button', { name: 'Seite erstellen' }).click();
    await expect.poll(() => state.site?.subdomain ?? null).toBe(HANDLE);
    expect(state.createBodies[0]).toMatchObject({
      subdomain: HANDLE,
      site_title: GENERATED.hero.heading,
    });

    // Edit and publish through the stubbed API; the editor needs Hocuspocus.
    const headline = 'Zusammen für Musterstadt';
    const call = (method: string, path: string, body: unknown) =>
      page.evaluate(
        async ({ method, path, body }) => {
          const res = await fetch(path, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          return res.status;
        },
        { method, path, body }
      );
    const id = state.site?.id ?? '';
    expect(await call('PUT', `/api/sites/${id}`, { tagline: headline, legal: LEGAL })).toBe(200);
    expect(await call('POST', `/api/sites/${id}/publish`, { publish: true })).toBe(200);
    expect(state.published).toBe(true);
    expect(state.snapshot?.tagline).toBe(headline);

    const publicPage = await context.newPage();
    await publicPage.goto(`${PUBLIC_ORIGIN}/${HANDLE}`);
    await expect(publicPage.locator('main')).toBeVisible();
    await expect(publicPage.locator('html')).toHaveAttribute('lang', 'de-DE');
    await expect(publicPage.getByText(headline).first()).toBeVisible();
    await expect(publicPage.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
  });
});

test.describe('Sites: öffentliche Seite, axe', () => {
  for (const locale of ['de-DE', 'de-AT'] as const satisfies readonly SupportedLocale[]) {
    test(`axe: public page ${locale}`, async ({ page, context }) => {
      const state = { site: makeSite(), snapshot: null, published: false, createBodies: [] };
      expect(publishFromDraft(state, locale).ok).toBe(true);
      await installPublicSite(context, state);

      await page.goto(`${PUBLIC_ORIGIN}/${HANDLE}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('script')).toHaveCount(0);

      const { violations, passes } = await wcagAxe(page).analyze();
      expect(passes.length).toBeGreaterThan(0);
      expect(
        violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
      ).toEqual([]);
    });
  }
});
