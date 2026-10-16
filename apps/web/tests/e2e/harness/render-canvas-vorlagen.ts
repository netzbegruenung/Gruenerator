/**
 * Renders the canvas Vorlagen of the private content checkout
 * (`$INTERN_CONTENT_DIR/sharepic-vorlagen/canvas/{de,at}.json`) through the
 * editor's own renderer (harness `tests/e2e/harness/canvas-render.html`) and
 * writes `thumbs/canvas/<id>.webp` beside them, 540 px wide. An entry that
 * fails the schema, or whose template does not fit its format, fails the run.
 *
 * Needs the web dev server (`VITE_DEV_PORT=3100 pnpm dev`):
 *   INTERN_CONTENT_DIR=… HARNESS_URL=http://localhost:3100 \
 *     npx tsx apps/web/tests/e2e/harness/render-canvas-vorlagen.ts [id …]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from '@playwright/test';

import type {} from './canvasHarness.js';

const base = process.env.HARNESS_URL ?? 'http://localhost:3000';
const root = process.env.INTERN_CONTENT_DIR;
if (!root) throw new Error('INTERN_CONTENT_DIR is not set');
const dir = path.join(root, 'sharepic-vorlagen');
const outDir = path.join(dir, 'thumbs', 'canvas');
const THUMB_WIDTH = 540;
const only = new Set(process.argv.slice(2));

const entries = ['de.json', 'at.json'].flatMap((name) => {
  const file = path.join(dir, 'canvas', name);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { id: string }[]) : [];
});

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${base}/tests/e2e/harness/canvas-render.html`);
await page.waitForFunction(() => window.__canvasHarness != null);

let failed = 0;
const todo = entries.filter((e) => only.size === 0 || only.has(e.id));
for (const entry of todo) {
  const result = await page.evaluate(([e, width]) => window.__canvasHarness!.render(e, width), [
    entry,
    THUMB_WIDTH,
  ] as const);
  if (!('image' in result)) {
    failed++;
    console.error(`${entry.id}: ${result.error}`);
    continue;
  }
  writeFileSync(
    path.join(outDir, `${entry.id}.webp`),
    Buffer.from(result.image.split(',')[1]!, 'base64')
  );
  process.stdout.write(`${entry.id}\n`);
}
await browser.close();
process.stdout.write(`${todo.length - failed}/${todo.length} rendered\n`);
process.exit(failed ? 1 : 0);
