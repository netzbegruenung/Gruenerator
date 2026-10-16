/**
 * Renders the print Vorlagen (`PRINT_VORLAGEN`) through the editor's own
 * renderer (harness `tests/e2e/harness/print-render.html`) and writes
 *
 *   apps/web/public/vorlagen/print/<id>.webp     front side, the gallery thumbnail
 *   apps/web/public/vorlagen/print/<id>-2.webp   back side of a two-page product
 *
 * cropped to the trimmed format, 540 px wide, without bleed or guides.
 *
 * Needs the web dev server (`VITE_DEV_PORT=3100 pnpm dev`):
 *   HARNESS_URL=http://localhost:3100 npx tsx apps/web/tests/e2e/harness/render-print-vorlagen.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import type {} from './printHarness.js';

const base = process.env.HARNESS_URL ?? 'http://localhost:3000';
const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../public/vorlagen/print'
);
const THUMB_WIDTH = 540;

const decode = (dataUrl: string): Buffer => Buffer.from(dataUrl.split(',')[1]!, 'base64');

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/tests/e2e/harness/print-render.html`);
await page.waitForFunction(() => window.__printHarness != null);
const entries = await page.evaluate(() => window.__printHarness!.vorlagen());

let failed = 0;
for (const entry of entries) {
  const result = await page.evaluate(
    ([spec, width]) => window.__printHarness!.render(spec, width),
    [entry.spec, THUMB_WIDTH] as const
  );
  if (!('images' in result)) {
    failed++;
    console.error(`${entry.id}: ${result.error}`);
    continue;
  }
  for (const [i, src] of result.images.entries()) {
    const name = i === 0 ? `${entry.id}.webp` : `${entry.id}-${i + 1}.webp`;
    writeFileSync(path.join(outDir, name), decode(src));
  }
  process.stdout.write(`${entry.id}: ${result.images.length} page(s)\n`);
}
await browser.close();
process.stdout.write(`${entries.length - failed}/${entries.length} rendered\n`);
process.exit(failed ? 1 : 0);
