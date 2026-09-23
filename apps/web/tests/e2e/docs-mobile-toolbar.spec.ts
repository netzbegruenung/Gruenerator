/**
 * BlockNotes Mobile-Formatierungsleiste im Docs-Editor, im echten Browser.
 *
 * Seit BlockNote 0.55 schaltet `FormattingToolbarController` auf Touch-Geräten
 * selbst auf die Mobile-Leiste um, sobald die Bildschirmtastatur offen ist, und
 * heftet sie an die Unterkante des Visual Viewports. Die Tastatur erkennt
 * BlockNote allein daran, dass der Visual Viewport um mehr als 150 px schrumpft.
 * Genau das simuliert der Test: Playwright kann keine Tastatur öffnen, aber den
 * Viewport verkleinern.
 *
 * Deshalb steht neben dem Editor ein Composer-Stellvertreter mit
 * `useMobileKeyboardOffset`: der Hook schaltete früher auf Chromium die Tastatur
 * seitenweit in den Overlay-Modus (`overlaysContent = true`), der Viewport
 * schrumpfte nicht mehr, und die Leiste blieb unsichtbar.
 *
 * Der Harness (`harness/docs-editor.html`) mountet den echten `BlockNoteEditor`
 * ohne Backend und ohne Y.Doc — die Docs-Route bräuchte Login, API und
 * Hocuspocus, und keines davon sagt etwas über die Leiste.
 */
import { test, expect, devices, type Page } from '@playwright/test';

import './harness/docsEditorHarness.js';

const HARNESS = '/tests/e2e/harness/docs-editor.html';

// `defaultBrowserType` darf nicht in einem describe stehen (erzwänge einen neuen
// Worker); die Projekte laufen ohnehin auf Chromium.
function deviceOptions(name: keyof typeof devices) {
  const { defaultBrowserType: _browser, ...options } = devices[name];
  return options;
}
const KEYBOARD_HEIGHT = 340;

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bn-editor')).toContainText('Hallo Welt');
}

async function focusEditorAndSelect(page: Page, text: string): Promise<void> {
  await page.locator('.bn-editor p', { hasText: 'Hallo Welt' }).tap();
  expect(await page.evaluate((t) => window.__docsEditorHarness!.selectText(t), text)).toBe(true);
}

async function setKeyboard(page: Page, open: boolean): Promise<void> {
  const { width, height } = devices['Pixel 7'].viewport;
  await page.setViewportSize({ width, height: open ? height - KEYBOARD_HEIGHT : height });
}

test.describe('Touch-Gerät (Pixel 7)', () => {
  test.use(deviceOptions('Pixel 7'));

  test('zeigt BlockNotes Mobile-Leiste über der Tastatur, ohne AI-Knopf', async ({ page }) => {
    await openHarness(page);
    await focusEditorAndSelect(page, 'Welt');

    const toolbar = page.locator('.bn-mobile-formatting-toolbar');
    await expect(toolbar).toHaveCount(0);

    await setKeyboard(page, true);
    await expect(toolbar).toBeVisible();

    const box = await toolbar.boundingBox();
    const viewportBottom = await page.evaluate(
      () => window.visualViewport!.offsetTop + window.visualViewport!.height
    );
    expect(box).not.toBeNull();
    expect(Math.abs(box!.y + box!.height - viewportBottom)).toBeLessThanOrEqual(2);

    await expect(toolbar.locator('[data-test="bold"]')).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Mit KI bearbeiten' })).toHaveCount(0);

    // Die eigene, fixierte Unterleiste von vor 0.55 ist weg.
    await expect(page.locator('.blocknote-static-toolbar')).toHaveCount(0);
  });

  test('Fett-Knopf der Mobile-Leiste formatiert die Auswahl und behält den Fokus', async ({
    page,
  }) => {
    await openHarness(page);
    await focusEditorAndSelect(page, 'Welt');
    await setKeyboard(page, true);

    const toolbar = page.locator('.bn-mobile-formatting-toolbar');
    await toolbar.locator('[data-test="bold"]').tap();

    await expect(page.locator('.bn-editor strong')).toHaveText('Welt');
    // Ein Blur hätte die Tastatur geschlossen und die Leiste abgebaut.
    await expect(toolbar).toBeVisible();
  });

  test('Leiste verschwindet, wenn die Tastatur zugeht', async ({ page }) => {
    await openHarness(page);
    await focusEditorAndSelect(page, 'Welt');
    await setKeyboard(page, true);
    await expect(page.locator('.bn-mobile-formatting-toolbar')).toBeVisible();

    await setKeyboard(page, false);
    await expect(page.locator('.bn-mobile-formatting-toolbar')).toHaveCount(0);
  });

  test('ein Composer mit useMobileKeyboardOffset schaltet die Tastatur nicht in den Overlay-Modus', async ({
    page,
  }) => {
    await openHarness(page);
    await page.getByRole('textbox', { name: 'Composer' }).tap();

    const overlays = await page.evaluate(
      () =>
        (navigator as Navigator & { virtualKeyboard?: { overlaysContent: boolean } })
          .virtualKeyboard?.overlaysContent ?? null
    );
    // null hieße: dieses Chromium kennt die API nicht, der Test bewiese nichts.
    expect(overlays).toBe(false);

    // Und die Leiste funktioniert danach im Editor weiterhin.
    await focusEditorAndSelect(page, 'Welt');
    await setKeyboard(page, true);
    await expect(page.locator('.bn-mobile-formatting-toolbar')).toBeVisible();
  });
});

test.describe('Desktop', () => {
  test.use(deviceOptions('Desktop Chrome'));

  test('zeigt die schwebende Leiste mit AI-Knopf, keine Mobile-Leiste', async ({ page }) => {
    await openHarness(page);
    await page.locator('.bn-editor p', { hasText: 'Hallo Welt' }).click();
    await page.evaluate(() => window.__docsEditorHarness!.selectText('Welt'));

    const toolbar = page.locator('.bn-formatting-toolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Mit KI bearbeiten' })).toBeVisible();
    await expect(page.locator('.bn-mobile-formatting-toolbar')).toHaveCount(0);
  });
});
