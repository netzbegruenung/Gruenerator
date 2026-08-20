/**
 * Klickfläche der Notebook-Karte, im echten Browser.
 *
 * Warum diese Lane zusätzlich zu den RTL-Tests existiert: jsdom hat kein
 * Layout. `user.click(getByRole('button'))` trifft den Knopf per Referenz und
 * kann deshalb nicht sehen, ob im Browser etwas ÜBER ihm liegt. Genau dort saß
 * der Fehler: `NotebookCoverArt` ist selbst `position: relative` und landet
 * damit in derselben Mal-Ebene wie der `z-0`-Streckknopf der Karte — in
 * Baumreihenfolge dahinter, also darüber. Ein Klick auf „Von der Basis" (und auf
 * jedes eigene Notebook) traf das Cover statt den Knopf und tat nichts;
 * Landesverbände blieb heil, weil ein nicht positioniertes <img> eine Ebene
 * tiefer malt.
 *
 * Geprüft wird deshalb, was die Nutzerin gemeldet hat — ein Mausklick in die
 * Mitte der Karte öffnet sie —, nicht eine Klassenzeichenkette.
 */
import { test, expect, type Page } from '@playwright/test';

const HARNESS = '/tests/e2e/harness/notebook-card.html';

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('card-cover-node').waitFor();
}

const hits = (page: Page) =>
  page.evaluate(() => window.__notebookCardHarness?.hits ?? []) as Promise<string[]>;

/** Klickt die geometrische Mitte der Karte — dort, wo das Cover liegt. */
async function clickCentre(page: Page, testId: string): Promise<void> {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

test.describe('NotebookGalleryCard — Klick auf die Karte', () => {
  test('das designte webp öffnet die Karte', async ({ page }) => {
    await openHarness(page);
    await clickCentre(page, 'card-cover-image');
    expect(await hits(page)).toEqual(['cover-image']);
  });

  test('die gerenderte Cover-Art öffnet die Karte ebenso', async ({ page }) => {
    await openHarness(page);
    await clickCentre(page, 'card-cover-node');
    expect(await hits(page)).toEqual(['cover-node']);
  });

  test('die Aktion oben rechts bleibt über dem Streckknopf erreichbar', async ({ page }) => {
    await openHarness(page);
    await page.getByRole('button', { name: 'Gefällt mir' }).click();
    // Nur die Aktion — der Streckknopf darf nicht mit ausgelöst werden.
    expect(await hits(page)).toEqual(['action']);
  });
});
