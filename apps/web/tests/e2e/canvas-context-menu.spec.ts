import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { quietEditorChrome } from './fixtures/apiFixtures';
import { isDevBypassHonored } from './fixtures/pageHelpers';

/**
 * Das Kontextmenü des Canvas-Editors am echten Stack: `/studio/canvas/:id` mit
 * Hocuspocus, angemeldet über den Dev-Bypass. Jeder Test legt seine eigene
 * Leinwand an — Züge und Sperren schreiben über Collab dauerhaft ins Dokument.
 *
 * Läuft nur lokal, gegen einen laufenden Stack (API mit
 * `ALLOW_DEV_AUTH_BYPASS=true`, Hocuspocus, Vite mit `VITE_E2E_AUTH_BYPASS=true`):
 *
 *   E2E_SKIP_SERVER=1 E2E_BASE_URL=http://localhost:3113 E2E_API_URL=http://localhost:3111 \
 *   VITE_E2E_AUTH_BYPASS=true DEV_AUTH_BYPASS_TOKEN=… \
 *   pnpm --filter @gruenerator/web exec playwright test canvas-context-menu.spec.ts
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:3001';
const TOKEN = process.env.DEV_AUTH_BYPASS_TOKEN;
const headers = { 'x-dev-auth-bypass': TOKEN ?? '' };

const shape = (id: string, x: number, y: number) => ({
  id,
  type: 'rect',
  x,
  y,
  width: 180,
  height: 180,
  fill: '#005538',
  stroke: '#005538',
  strokeWidth: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
});

const TEXT = {
  id: 'e2e-t',
  text: 'Hallo Kontextmenü',
  type: 'body',
  x: 150,
  y: 900,
  width: 700,
  fontSize: 60,
  fontFamily: 'PT Sans',
  fill: '#000000',
};

test.skip(!!process.env.CI, 'braucht einen laufenden lokalen Dev-Stack');

let canvasId: string | null = null;

async function createCanvas(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API}/api/canvas`, {
    headers,
    data: {
      title: 'E2E Kontextmenü',
      template_type: 'freeform',
      initial_state: {
        pages: [
          {
            id: 'seed-0',
            configId: 'freeform',
            state: {
              shapeInstances: [shape('e2e-a', 300, 400), shape('e2e-b', 700, 400)],
              additionalTexts: [TEXT],
            },
          },
        ],
      },
    },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test.beforeEach(async ({ page, request }) => {
  test.skip(
    process.env.VITE_E2E_AUTH_BYPASS !== 'true' || !(await isDevBypassHonored(request, API, TOKEN)),
    'Dev-Bypass wird vom Backend nicht angenommen'
  );
  canvasId = await createCanvas(request);
  await quietEditorChrome(page);
  await openEditor(page);
});

test.afterEach(async ({ request }) => {
  if (canvasId) await request.delete(`${API}/api/canvas/${canvasId}`, { headers });
  canvasId = null;
});

async function openEditor(page: Page) {
  await page.goto(`/studio/canvas/${canvasId}`);
  await page.waitForFunction(() => {
    const stages = (window as unknown as { Konva?: { stages: unknown[] } }).Konva?.stages;
    return !!stages && stages.length > 0;
  });
  // Bis Hocuspocus synchronisiert hat, sind die Seiten `inert`.
  const pages = page.locator('.heterogeneous-multipage__pages-container');
  await expect(pages).toBeVisible();
  await expect(pages).not.toHaveAttribute('inert', /.*/, { timeout: 20_000 });
  await expect.poll(() => shapeIds(page)).toEqual(['e2e-a', 'e2e-b']);
}

type Box = { x: number; y: number; width: number; height: number };

/** Box eines Elements in Fensterkoordinaten — ohne seinen Transformer. */
function itemBox(page: Page, id: string): Promise<Box> {
  return page.evaluate((itemId) => {
    type KNode = {
      getAttr: (k: string) => unknown;
      getClientRect: () => Box;
      getChildren: () => KNode[];
      getClassName: () => string;
    };
    type KStage = KNode & {
      findOne: (fn: (n: KNode) => boolean) => KNode | undefined;
      container: () => HTMLElement;
      width: () => number;
    };
    const { Konva } = window as unknown as { Konva: { stages: KStage[] } };
    const stage = Konva.stages.find((s) => s.container().isConnected)!;
    const item = stage.findOne((n) => n.getAttr('canvasItemId') === itemId)!;
    const rects = item
      .getChildren()
      .filter((c) => c.getClassName() !== 'Transformer')
      .map((c) => c.getClientRect());
    const x = Math.min(...rects.map((r) => r.x));
    const y = Math.min(...rects.map((r) => r.y));
    const right = Math.max(...rects.map((r) => r.x + r.width));
    const bottom = Math.max(...rects.map((r) => r.y + r.height));
    const container = stage.container().getBoundingClientRect();
    const css = container.width / stage.width();
    return {
      x: container.left + x * css,
      y: container.top + y * css,
      width: (right - x) * css,
      height: (bottom - y) * css,
    };
  }, id);
}

/** Die Formen der Seite in Zeichenreihenfolge (hinten → vorn); Kopien heißen `shape-…`. */
function shapeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type KNode = { getAttr: (k: string) => unknown };
    type KStage = { find: (sel: string) => KNode[]; container: () => HTMLElement };
    const { Konva } = window as unknown as { Konva?: { stages: KStage[] } };
    const stage = Konva?.stages.find((s) => s.container().isConnected);
    if (!stage) return [];
    return stage
      .find('.canvas-item')
      .map((n) => n.getAttr('canvasItemId'))
      .filter(
        (id): id is string =>
          typeof id === 'string' && (id === 'e2e-a' || id === 'e2e-b' || id.startsWith('shape-'))
      );
  });
}

const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

async function rightClickItem(page: Page, id: string) {
  const c = center(await itemBox(page, id));
  await page.mouse.click(c.x, c.y, { button: 'right' });
}

const menu = (page: Page, name: string | RegExp = 'Element') => page.getByRole('menu', { name });
const item = (page: Page, name: string | RegExp) => page.getByRole('menuitem', { name });

test('Rechtsklick öffnet das Menü mit Kürzel; Duplizieren lässt sich rückgängig machen', async ({
  page,
}) => {
  await rightClickItem(page, 'e2e-a');
  await expect(menu(page)).toBeVisible();
  await expect(item(page, /^Duplizieren/)).toContainText(/Strg\+D|⌘D/);

  await item(page, /^Duplizieren/).click();
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => shapeIds(page).then((ids) => ids.length)).toBe(3);

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => shapeIds(page).then((ids) => ids.length)).toBe(2);
});

test('Löschen über das Menü und zurück', async ({ page }) => {
  await rightClickItem(page, 'e2e-a');
  await item(page, /^Löschen/).click();
  await expect.poll(() => shapeIds(page)).toEqual(['e2e-b']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => shapeIds(page)).toEqual(['e2e-a', 'e2e-b']);
});

test('Ebene: ganz nach vorne und ganz nach hinten', async ({ page }) => {
  await rightClickItem(page, 'e2e-a');
  await item(page, 'Ebene').hover();
  await item(page, 'Ganz nach vorne').click();
  await expect.poll(() => shapeIds(page)).toEqual(['e2e-b', 'e2e-a']);

  await rightClickItem(page, 'e2e-a');
  await item(page, 'Ebene').hover();
  await item(page, 'Ganz nach hinten').click();
  await expect.poll(() => shapeIds(page)).toEqual(['e2e-a', 'e2e-b']);
});

test('Hier einfügen legt die Kopie mit der linken oberen Ecke an den Klickpunkt', async ({
  page,
}) => {
  await rightClickItem(page, 'e2e-a');
  await item(page, /^Kopieren/).click();

  const b = await itemBox(page, 'e2e-b');
  const point = { x: b.x, y: b.y + b.height + 60 };
  // Freie Fläche ist auf freeform die Hintergrundfläche: ihr Menü bietet Einfügen auch.
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await expect(menu(page, 'Hintergrund')).toBeVisible();
  await item(page, 'Hier einfügen').click();

  await expect.poll(() => shapeIds(page).then((ids) => ids.length)).toBe(3);
  const pasted = (await shapeIds(page)).find((id) => id !== 'e2e-a' && id !== 'e2e-b')!;
  const box = await itemBox(page, pasted);
  expect(Math.abs(box.x - point.x)).toBeLessThanOrEqual(3);
  expect(Math.abs(box.y - point.y)).toBeLessThanOrEqual(3);
});

test('Mehrfachauswahl: ein Rechtsklick behält sie, Duplizieren ist ein Schritt', async ({
  page,
}) => {
  const a = await itemBox(page, 'e2e-a');
  const b = await itemBox(page, 'e2e-b');
  await page.mouse.click(center(a).x, center(a).y);
  await page.keyboard.down('Shift');
  await page.mouse.click(center(b).x, center(b).y);
  await page.keyboard.up('Shift');
  await expect(page.getByRole('toolbar', { name: '2 Elemente' })).toBeVisible();

  await rightClickItem(page, 'e2e-b');
  await expect(menu(page, '2 Elemente')).toBeVisible();
  await item(page, /^Duplizieren/).click();
  await expect.poll(() => shapeIds(page).then((ids) => ids.length)).toBe(4);

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => shapeIds(page).then((ids) => ids.length)).toBe(2);
});

test('Sperren: kein Ziehen, kein Löschen, und nach dem Neuladen noch gesperrt', async ({
  page,
}) => {
  await rightClickItem(page, 'e2e-a');
  await item(page, 'Sperren').click();

  const before = await itemBox(page, 'e2e-a');
  const c = center(before);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  expect(await shapeIds(page)).toEqual(['e2e-a', 'e2e-b']);
  expect((await itemBox(page, 'e2e-a')).x).toBeCloseTo(before.x, 0);

  await page.reload();
  await openEditor(page);
  await rightClickItem(page, 'e2e-a');
  await expect(item(page, 'Entsperren')).toBeVisible();
  await expect(item(page, /^Löschen/)).toHaveAttribute('aria-disabled', 'true');
});

test('Umschalt+F10 öffnet das Menü an der Auswahl, Escape schließt es', async ({ page }) => {
  const c = center(await itemBox(page, 'e2e-a'));
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[role="menuitem"]:focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
  // Escape im Menü hebt die Auswahl nicht auf: die Leiste steht noch.
  await expect(page.getByRole('button', { name: /^Löschen/ })).toBeVisible();
});

test('Im Text-Editor bleibt das Browser-Menü', async ({ page }) => {
  const c = center(await itemBox(page, 'e2e-t'));
  await page.mouse.dblclick(c.x, c.y);
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeVisible();
  const box = (await editor.boundingBox())!;
  await page.mouse.click(box.x + 10, box.y + 10, { button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('Leiste: Element löschen statt Seite löschen', async ({ page }) => {
  const c = center(await itemBox(page, 'e2e-a'));
  await page.mouse.click(c.x, c.y);
  await expect(page.getByRole('button', { name: /^Löschen/ })).toBeVisible();
  await expect(page.getByTitle('Seite löschen')).toHaveCount(0);
});

test('Ein zweiter Rechtsklick öffnet das Menü dort neu, die Auswahl folgt', async ({ page }) => {
  // Erst B, dann A: das Menü öffnet rechts vom Zeiger und liegt sonst über B.
  await rightClickItem(page, 'e2e-b');
  await expect(menu(page)).toBeVisible();
  await rightClickItem(page, 'e2e-a');
  await expect(menu(page)).toBeVisible();
  await item(page, /^Löschen/).click();
  await expect.poll(() => shapeIds(page)).toEqual(['e2e-b']);
});
