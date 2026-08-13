/**
 * Resize-Geometrie des Canvas-Editors, im echten Browser.
 *
 * Warum diese Lane zusätzlich zu `shapeTransform.vitest.ts` existiert: der
 * vitest-Test prüft die Arithmetik gegen eine *angenommene* Konva-Skalierung.
 * Ob Konvas Transformer die Node wirklich so hinterlässt, kann er nicht wissen —
 * jsdom hat kein Layout, kein Canvas und keine Zeigerereignisse. Genau in dieser
 * Lücke saß der Fehler: Path-Formen (X, Herz, Wolke, Pfeil, Plus, Tanne, Blob,
 * Sprechblasen, Banner) rendern mit `scaleX = width / 100`, der Handler las
 * `node.scaleX()` aber als Ziehfaktor. Ein Zug auf 90 % machte aus 300 dann 810
 * — „je kleiner ich ziehe, desto größer wird es".
 *
 * Geprüft wird deshalb die Eigenschaft, die die Userin gemeldet hat, und nicht
 * eine Zwischengröße: Ziehe ich die Ecke um N Pixel nach innen, muss die Form
 * hinterher rund N Pixel schmaler auf dem Schirm stehen.
 *
 * Der Harness (`harness/shape-transform.html`) mountet genau eine
 * `ShapePrimitive` auf einer nackten Stage — der Editor selbst bräuchte Backend,
 * Dokument und Elemente-Panel, und keines davon sagt etwas über Resize-Geometrie.
 */
import { test, expect, type Page } from '@playwright/test';

import type { HarnessBox } from './harness/shapeHarness.js';

const HARNESS = '/tests/e2e/harness/shape-transform.html';

async function openHarness(page: Page, type: string): Promise<void> {
  await page.goto(`${HARNESS}?type=${type}`, { waitUntil: 'domcontentloaded' });
  // Auf die Form warten, nicht auf die Uhr: react-konva mountet die Stage erst
  // nach dem Hydrieren, und der Transformer hängt sich in einem Effect an.
  await page.waitForFunction(() => window.__shapeHarness?.anchorPos('bottom-right') != null);
}

const shapeSize = (page: Page) =>
  page.evaluate(() => {
    const shape = window.__shapeHarness!.shape;
    return { width: shape.width, height: shape.height, scaleX: shape.scaleX };
  });

const renderedBox = (page: Page) =>
  page.evaluate(() => window.__shapeHarness!.renderedBox()) as Promise<HarnessBox>;

/** Zieht den Bottom-right-Anker diagonal um `delta` Pixel nach innen. */
async function dragCornerInward(page: Page, delta: number): Promise<void> {
  const anchor = await page.evaluate(() => window.__shapeHarness!.anchorPos('bottom-right'));
  expect(anchor).not.toBeNull();

  await page.mouse.move(anchor!.x, anchor!.y);
  await page.mouse.down();
  // In Schritten, damit Konva echte mousemove-Folgen sieht — ein einzelner
  // Sprung erzeugt keinen Transform.
  await page.mouse.move(anchor!.x - delta, anchor!.y - delta, { steps: 12 });
  await page.mouse.up();
}

test.describe('Canvas-Formen skalieren in die gezogene Richtung', () => {
  test('Path-Form (x-mark) wird kleiner, wenn die Ecke nach innen gezogen wird', async ({
    page,
  }) => {
    await openHarness(page, 'x-mark');

    const before = await shapeSize(page);
    const boxBefore = await renderedBox(page);
    expect(before.width).toBe(300);

    const DELTA = 60;
    await dragCornerInward(page, DELTA);

    const after = await shapeSize(page);
    const boxAfter = await renderedBox(page);

    // Der eigentliche Regressionswächter. Vor dem Fix: 300 → ~810.
    expect(after.width).toBeLessThan(before.width);

    // Die Form muss um das ankommen, was gezogen wurde — nicht bloß irgendwie
    // kleiner. Toleranz für Ankergröße und Konvas Ratio-Projektion.
    expect(boxAfter.width).toBeCloseTo(boxBefore.width - DELTA, -1);
    expect(boxAfter.height).toBeCloseTo(boxBefore.height - DELTA, -1);

    // Die Größe landet in width/height, die Node-Skalierung bleibt neutral —
    // sonst multipliziert sich beides beim nächsten Zug auf.
    expect(after.scaleX).toBe(1);
  });

  test('wiederholtes Verkleinern schaukelt sich nicht auf', async ({ page }) => {
    await openHarness(page, 'x-mark');

    const start = (await shapeSize(page)).width;
    let previous = start;

    // Vor dem Fix wuchs die Breite bei JEDEM Zug: 300 → 810 → 5905 → …
    for (let i = 0; i < 3; i++) {
      await dragCornerInward(page, 40);
      const current = (await shapeSize(page)).width;
      expect(current).toBeLessThan(previous);
      previous = current;
    }

    expect(previous).toBeLessThan(start);
  });

  test('Nicht-Path-Form (Rechteck) skaliert unverändert korrekt', async ({ page }) => {
    // Die andere Formfamilie trug den Fehler nie — der Fix darf sie nicht kippen.
    await openHarness(page, 'rect');

    const before = await shapeSize(page);
    const boxBefore = await renderedBox(page);

    const DELTA = 60;
    await dragCornerInward(page, DELTA);

    const after = await shapeSize(page);
    const boxAfter = await renderedBox(page);

    expect(after.width).toBeLessThan(before.width);
    expect(boxAfter.width).toBeCloseTo(boxBefore.width - DELTA, -1);
    expect(after.scaleX).toBe(1);
  });
});
