/**
 * Visual regression of composed sharepics, DE and AT, in a real browser.
 *
 * Every Grünerator-Vorlage is a creator spec run through `composeSharepic` and
 * the editor's renderer; the composer's own tests check layout numbers, not
 * pixels. This lane renders the composer's public fixture specs (one per form
 * and feature, both corporate designs) through the harness
 * `harness/sharepic-render.html` and compares each slide to a baseline.
 *
 * Only public fixtures: baselines are committed, and the real catalogue is
 * party content (`gruenerator-intern`). Its thumbnails come from the same
 * harness via `harness/render-sharepic-vorlagen.ts`.
 *
 * Baselines are per platform (`-darwin`, `-linux`). Linux ones for CI come from
 * the Playwright image:
 *   docker run --rm -v "$PWD":/w -w /w/apps/web mcr.microsoft.com/playwright:v<version>-noble \
 *     npx playwright test sharepic-visual --update-snapshots
 */
import { expect, test, type Page } from '@playwright/test';

import type {} from './harness/sharepicHarness.js';

const HARNESS = '/tests/e2e/harness/sharepic-render.html';

async function openHarness(page: Page): Promise<void> {
  await page.goto(HARNESS, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sharepicHarness != null);
}

test.describe('sharepic composer, visual', () => {
  test('every renderable fixture matches its baseline', async ({ page }) => {
    test.setTimeout(180_000);
    await openHarness(page);
    const names = await page.evaluate(() => window.__sharepicHarness!.fixtures());
    expect(names.length).toBeGreaterThan(5);

    for (const name of names) {
      const result = await page.evaluate((n) => window.__sharepicHarness!.renderFixture(n), name);
      expect(result, name).toHaveProperty('images');
      const images = 'images' in result ? result.images : [];
      for (const [i, src] of images.entries()) {
        await page.setContent(`<img id="slide" src="${src}" style="display:block;width:432px">`);
        await page.locator('#slide').evaluate((img: HTMLImageElement) => img.decode());
        await expect(page.locator('#slide'), `${name} slide ${i + 1}`).toHaveScreenshot(
          `${name}-${i + 1}.png`,
          { maxDiffPixelRatio: 0.01 }
        );
      }
      await openHarness(page);
    }
  });
});
