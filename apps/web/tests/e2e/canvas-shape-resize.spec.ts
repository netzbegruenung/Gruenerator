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

/** Zieht den Bottom-right-Anker `ueberschuss` Pixel ÜBER die gegenüberliegende Ecke hinaus. */
async function dragCornerPastOpposite(page: Page, ueberschuss: number): Promise<void> {
  const anchor = await page.evaluate(() => window.__shapeHarness!.anchorPos('bottom-right'));
  const box = await renderedBox(page);

  await page.mouse.move(anchor!.x, anchor!.y);
  await page.mouse.down();
  await page.mouse.move(box.x - ueberschuss, box.y - ueberschuss, { steps: 30 });
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

  // Nachgemessen zum Review-Hinweis, der Transformer setze `flipEnabled` nicht
  // auf false, wodurch ein Flip-Zug eine negative `node.scaleX()` erzeuge, die
  // dann auf MIN_SHAPE_SIZE geklemmt werde. Das reproduziert nicht: der
  // bestehende `boundBoxFunc` (Box < 5 → oldBox) fängt den Übertritt ab, bevor
  // eine negative Skalierung bei `handleTransformEnd` ankommt. Gemessen über
  // Überschüsse von 0 bis 150 px, an x-mark, arrow und checkmark: die Größe
  // blieb immer positiv, die kleinste war ~7,3 — nie die geklemmten 5, nie
  // negativ, und ein asymmetrischer Pfeil zeigte hinterher unverändert nach
  // rechts (kein stiller Spiegel). Der Test hält genau das fest, damit ein
  // künftiges Aufweichen des boundBoxFunc nicht unbemerkt eine entartete Form
  // erzeugt.
  for (const ueberschuss of [0, 10, 150]) {
    test(`Zug ${ueberschuss}px über die Ecke hinaus entartet die Form nicht`, async ({ page }) => {
      await openHarness(page, 'x-mark');

      await dragCornerPastOpposite(page, ueberschuss);

      const after = await shapeSize(page);
      const box = await renderedBox(page);

      expect(after.width).toBeGreaterThan(0);
      expect(after.height).toBeGreaterThan(0);
      expect(Number.isFinite(after.width)).toBe(true);
      // Die Node-Skalierung darf nicht negativ hängenbleiben — sonst nimmt der
      // nächste Zug sie als Ausgangswert und die Form kippt.
      expect(after.scaleX).toBe(1);
      expect(box.width).toBeGreaterThan(0);
    });
  }

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
