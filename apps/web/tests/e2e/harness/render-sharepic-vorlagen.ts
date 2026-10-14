/**
 * Renders the private sharepic Vorlagen catalogue through the editor's own
 * renderer (harness `tests/e2e/harness/sharepic-render.html`) and writes, into
 * the private checkout:
 *
 *   sharepic-vorlagen/thumbs/<id>.webp     cover slide, served as the gallery thumbnail
 *   sharepic-vorlagen/thumbs/<id>-<n>.webp further slides of a carousel, shown in the detail view
 *
 * `sharepic-vorlagen/vorschau-fotos.json` (optional) maps a Vorlage id to
 * { "<stock filename in its spec>": "<photo path under sharepic-vorlagen/>" }:
 * the thumbnail shows that private photo, the copied Vorlage keeps the stock one.
 *
 * Needs the web dev server (`VITE_DEV_PORT=3100 pnpm dev`):
 *   INTERN_CONTENT_DIR=… HARNESS_URL=http://localhost:3100 \
 *     npx tsx apps/web/tests/e2e/harness/render-sharepic-vorlagen.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

import type {} from './sharepicHarness.js';

const root = process.env.INTERN_CONTENT_DIR;
if (!root) throw new Error('INTERN_CONTENT_DIR is not set');
const base = process.env.HARNESS_URL ?? 'http://localhost:3000';
const dir = path.join(root, 'sharepic-vorlagen');
const THUMB_WIDTH = 540;

interface Entry {
  id: string;
  spec: unknown;
}

const decode = (dataUrl: string): Buffer => Buffer.from(dataUrl.split(',')[1]!, 'base64');

const entries = ['de.json', 'at.json'].flatMap(
  (file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Entry[]
);
const vorschauFile = path.join(dir, 'vorschau-fotos.json');
const vorschau: Record<string, Record<string, string>> = existsSync(vorschauFile)
  ? (JSON.parse(readFileSync(vorschauFile, 'utf8')) as Record<string, Record<string, string>>)
  : {};
const photosFor = (id: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(vorschau[id] ?? {}).map(([filename, file]) => [
      filename,
      `data:image/jpeg;base64,${readFileSync(path.join(dir, file)).toString('base64')}`,
    ])
  );
mkdirSync(path.join(dir, 'thumbs'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/tests/e2e/harness/sharepic-render.html`);
await page.waitForFunction(() => window.__sharepicHarness != null);
const webp = (src: string, width: number) =>
  page.evaluate(([s, w]) => window.__sharepicHarness!.toWebp(s, w), [src, width] as const);

let failed = 0;
for (const entry of entries) {
  const result = await page.evaluate((input) => window.__sharepicHarness!.render(input), {
    spec: entry.spec,
    photos: photosFor(entry.id),
  });
  if (!('images' in result)) {
    failed++;
    console.error(`${entry.id}: ${result.error}`);
    continue;
  }
  for (const [i, src] of result.images.entries()) {
    const name = i === 0 ? `${entry.id}.webp` : `${entry.id}-${i + 1}.webp`;
    writeFileSync(path.join(dir, 'thumbs', name), decode(await webp(src, THUMB_WIDTH)));
  }
  process.stdout.write(`${entry.id}: ${result.images.length} slide(s)\n`);
}
await browser.close();
process.stdout.write(`${entries.length - failed}/${entries.length} rendered\n`);
process.exit(failed ? 1 : 0);
