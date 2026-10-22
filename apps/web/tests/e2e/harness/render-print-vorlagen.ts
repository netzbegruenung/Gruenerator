/**
 * Renders the print Vorlagen of the private content checkout
 * (`$INTERN_CONTENT_DIR/sharepic-vorlagen/print/{de,at}.json`) through the
 * editor's own renderer (harness `tests/e2e/harness/print-render.html`) and
 * writes beside them
 *
 *   thumbs/print/<id>.webp     front side, the gallery thumbnail
 *   thumbs/print/<id>-2.webp   back side of a two-page product
 *
 * cropped to the trimmed format, 540 px wide, without bleed or guides. A spec
 * that does not parse or compose fails the run.
 *
 * Needs the web dev server (`VITE_DEV_PORT=3100 pnpm dev`):
 *   INTERN_CONTENT_DIR=… HARNESS_URL=http://localhost:3100 \
 *     npx tsx apps/web/tests/e2e/harness/render-print-vorlagen.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

import type {} from './printHarness.js';

const base = process.env.HARNESS_URL ?? 'http://localhost:3000';
const root = process.env.INTERN_CONTENT_DIR;
if (!root) throw new Error('INTERN_CONTENT_DIR is not set');
const dir = path.join(root, 'sharepic-vorlagen');
const outDir = path.join(dir, 'thumbs', 'print');
const THUMB_WIDTH = 540;

const decode = (dataUrl: string): Buffer => Buffer.from(dataUrl.split(',')[1]!, 'base64');

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/tests/e2e/harness/print-render.html`);
await page.waitForFunction(() => window.__printHarness != null);
const entries = ['de.json', 'at.json'].flatMap((name) => {
  const file = path.join(dir, 'print', name);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as { id: string; spec: unknown }[])
    : [];
});

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
