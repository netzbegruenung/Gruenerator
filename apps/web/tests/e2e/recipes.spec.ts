/**
 * Der Weg eines eigenen Rezepts, im echten Browser: anlegen, in der Übersicht
 * finden, im `@`-Menü mit Beschreibung wählen, senden (der Request trägt
 * `activeSkillMention`) und im Marktplatz unter „Alle“ als Abschnitt „Rezepte“
 * sehen.
 *
 * Kein Backend: der Auth-Bypass ist clientseitig (`VITE_E2E_AUTH_BYPASS=true`,
 * wie in `a11y.spec.ts`), die Rezept-Routen und der Chat-Stream sind gestubbt.
 * Gestubbt wird nur, was dieser Weg berührt — als Prädikat auf den Pfad, NICHT
 * als Glob über alle API-Pfade (der trifft auch Quelldateien des Dev-Servers unter
 * `/@fs/…/api/…` und der Bundle bootet nicht mehr). Alles übrige beantwortet
 * `installApiFixtures` mit einer leeren, wohlgeformten Hülle.
 *
 * Die Stubs halten einen kleinen Zustand (`recipes`): das PUT legt das Rezept
 * an, die Listen danach liefern es — so wie der Server.
 */
import { type MarketplaceListResponse } from '@gruenerator/contracts';
import { test, expect, type Page, type Route } from '@playwright/test';

import { installApiFixtures } from './fixtures/apiFixtures.js';

const BYPASS_AKTIV = process.env.VITE_E2E_AUTH_BYPASS === 'true';

const BRIEF = 'Einladung zur Mitgliederversammlung, förmlicher Ton, mit Tagesordnung.';
const SPEC = {
  title: 'Vereinseinladung',
  mention: 'vereinseinladung',
  description: 'Einladung zur Mitgliederversammlung. Nutzen, wenn ein Verein einlädt.',
  iconKey: 'PiEnvelope',
  styleBlock: 'Förmlicher Ton, mit Tagesordnung und Anmeldehinweis.',
};

interface StoredRecipe {
  id: string;
  mention: string;
  title: string;
  description: string | null;
  iconKey: string | null;
  styleBlock: string;
  category: string | null;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Die Zeile, wie `GET /api/text-forms` sie liefert. */
const asTextForm = (r: StoredRecipe) => ({
  id: r.id,
  kind: 'custom',
  textType: null,
  mention: r.mention,
  title: r.title,
  examples: [],
  styleBlock: r.styleBlock,
  model: null,
  analyzedAt: null,
  updatedAt: '2026-11-10T10:00:00.000Z',
  sharedWithGroups: [],
  sharedFromGroup: null,
  ownerName: null,
  description: r.description,
  iconKey: r.iconKey,
  category: r.category,
  shareMode: 'private',
  isPublic: false,
  publicOwnership: null,
});

/** Die schlanke Zeile des `@`-Menüs (`GET /api/text-forms/mentionable`). */
const asMentionable = (r: StoredRecipe) => ({
  id: r.id,
  mention: r.mention,
  title: r.title,
  description: r.description,
  iconKey: r.iconKey,
  category: r.category,
  kind: 'custom',
  sharedFromGroup: null,
  ownerName: null,
  isPublic: false,
});

/** Was der Marktplatz unter „Alle“ für die Suche nach dem Rezept liefert. */
function marketplaceWith(recipes: StoredRecipe[]): MarketplaceListResponse {
  return {
    sections: [
      {
        kind: 'recipe',
        hasMore: false,
        items: recipes.map((r) => ({
          kind: 'recipe' as const,
          key: `recipe:${r.id}`,
          ref: r.id,
          origin: 'oeffentlich' as const,
          title: r.title,
          description: r.description,
          thumbnailUrl: null,
          iconKey: r.iconKey,
          authorName: null,
          audience: 'all' as const,
          likesCount: 0,
          liked: false,
          saved: false,
          isOwn: true,
          reportKind: 'user_text_form' as const,
          createdAt: '2026-11-10T10:00:00.000Z',
          recipe: { mention: r.mention, rowId: r.id, skillCategory: null, system: false },
        })),
      },
    ],
  };
}

/** Rezept-Routen mit Zustand. Zuletzt registriert, damit sie vor der Auffangregel greifen. */
async function stubRecipeApi(page: Page): Promise<StoredRecipe[]> {
  const recipes: StoredRecipe[] = [];

  await page.route(
    (url) => url.pathname === '/api/text-forms/draft',
    (route) => json(route, { success: true, spec: SPEC })
  );
  await page.route(
    (url) => url.pathname === '/api/text-forms/mentionable',
    (route) => json(route, { success: true, forms: recipes.map(asMentionable) })
  );
  await page.route(
    (url) => url.pathname === '/api/text-forms',
    (route) => json(route, { success: true, forms: recipes.map(asTextForm) })
  );
  await page.route(
    (url) => /^\/api\/text-forms\/[^/]+$/.test(url.pathname),
    (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      const mention = new URL(route.request().url()).pathname.split('/').pop() ?? '';
      const body = route.request().postDataJSON() as Partial<StoredRecipe> & {
        category?: string | null;
      };
      const saved: StoredRecipe = {
        id: 'recipe-e2e-1',
        mention,
        title: body.title ?? mention,
        description: body.description ?? null,
        iconKey: body.iconKey ?? null,
        styleBlock: body.styleBlock ?? '',
        category: body.category ?? null,
      };
      recipes.splice(0, recipes.length, saved);
      return json(route, { success: true, form: asTextForm(saved) });
    }
  );
  await page.route(
    (url) => url.pathname === '/api/marketplace',
    (route) => json(route, marketplaceWith(recipes))
  );

  return recipes;
}

test.describe('Eigenes Rezept: anlegen, finden, nutzen', () => {
  test.skip(!BYPASS_AKTIV, 'VITE_E2E_AUTH_BYPASS ist nicht gesetzt.');

  test.beforeEach(async ({ page }) => {
    await installApiFixtures(page);
    await stubRecipeApi(page);
  });

  test('vom Entwurf bis zum Senden im Chat', async ({ page }) => {
    // 1. Anlegen: Beschreibung → Entwurf → Editor → Speichern.
    await page.goto('/agentura/rezept/neu');
    await page.getByPlaceholder('Beschreibe dein neues Rezept...').fill(BRIEF);
    await page.getByPlaceholder('Beschreibe dein neues Rezept...').press('Enter');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue(SPEC.title);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page).toHaveURL(/\/agentura\/rezept\/vereinseinladung$/);

    // 2. Es steht in der Übersicht der Grüneratoren.
    await page.goto('/grueneratoren');
    await expect(page.getByText(SPEC.title).first()).toBeVisible();

    // 3. Im `@`-Menü, mit Beschreibung.
    await page.goto('/chat');
    const composer = page.getByRole('textbox', { name: 'Nachricht an den Grünerator' });
    await composer.click();
    await composer.pressSequentially('@vereinsein');
    const option = page.getByRole('option', { name: /Vereinseinladung/ });
    await expect(option).toBeVisible();
    await expect(option).toContainText(SPEC.description);

    // 4. Auswahl und Senden: der Request trägt das Rezept.
    await page.route(
      (url) => url.pathname === '/api/chat-graph/stream',
      (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
    );
    await option.click();
    await composer.pressSequentially('Lade zur Versammlung am Freitag ein');
    const [request] = await Promise.all([
      page.waitForRequest((r) => new URL(r.url()).pathname === '/api/chat-graph/stream'),
      composer.press('Enter'),
    ]);
    expect(request.postDataJSON()).toMatchObject({ activeSkillMention: 'vereinseinladung' });
  });

  test('„Alle“ im Marktplatz zeigt den Abschnitt Rezepte', async ({ page }) => {
    // Das Rezept liegt hier schon auf dem Server: über denselben PUT anlegen wäre ein zweiter Weg.
    await page.goto('/agentura/rezept/neu');
    await page.getByPlaceholder('Beschreibe dein neues Rezept...').fill(BRIEF);
    await page.getByPlaceholder('Beschreibe dein neues Rezept...').press('Enter');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page).toHaveURL(/\/agentura\/rezept\/vereinseinladung$/);

    // „Alle“ ist der Standard-Reiter; erst mit einer Suche löst er die Startseite in Abschnitte auf.
    await page.goto('/marktplatz?q=Vereinseinladung');
    const section = page.getByRole('region', { name: 'Rezepte' });
    await expect(section).toBeVisible();
    await expect(section.getByText(SPEC.title)).toBeVisible();
  });
});
