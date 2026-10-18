/**
 * Renders the private sharepic Vorlagen catalogue through the editor's own
 * renderer (harness `tests/e2e/harness/sharepic-render.html`) and writes, into
 * the private checkout:
 *
 *   sharepic-vorlagen/thumbs/<id>.webp     cover slide, served as the gallery thumbnail
 *   sharepic-vorlagen/thumbs/<id>-<n>.webp further slides of a carousel, shown in the detail view
 *   sharepic-vorlagen/thumbs/seiten/<id>.<format>.webp
 *                                          a single Seite (`seiten/{de,at}.json`), once per format
 *   sharepic-vorlagen/thumbs/bloecke/<id>.webp
 *                                          a block (`bloecke/{de,at}.json`) alone, cut to its bounds
 *
 * `sharepic-vorlagen/vorschau-fotos.json` (optional) maps a Vorlage id to
 * { "<stock filename in its spec>": "<photo path under sharepic-vorlagen/>" }:
 * the thumbnail shows that private photo, the copied Vorlage keeps the stock one.
 * A `vorlage:<file>` photo the spec itself names is read from `sharepic-vorlagen/assets/`.
 *
 * Needs the web dev server (`VITE_DEV_PORT=3100 pnpm dev`):
 *   INTERN_CONTENT_DIR=… HARNESS_URL=http://localhost:3100 \
 *     npx tsx apps/web/tests/e2e/harness/render-sharepic-vorlagen.ts [id …]
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

interface SeiteEntry {
  id: string;
  formats: string[];
  slide: unknown;
}

const decode = (dataUrl: string): Buffer => Buffer.from(dataUrl.split(',')[1]!, 'base64');

const only = new Set(process.argv.slice(2));
const entries = ['de.json', 'at.json']
  .flatMap((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Entry[])
  .filter((e) => only.size === 0 || only.has(e.id));
const SEITEN_FILES = { 'de.json': 'de-DE', 'at.json': 'de-AT' } as const;
const seiten = Object.entries(SEITEN_FILES)
  .flatMap(([file, locale]) => {
    const source = path.join(dir, 'seiten', file);
    return existsSync(source)
      ? (JSON.parse(readFileSync(source, 'utf8')) as SeiteEntry[]).map((seite) => ({
          ...seite,
          locale,
        }))
      : [];
  })
  .filter((s) => only.size === 0 || only.has(s.id));
interface BlockEntry {
  id: string;
  items: unknown[];
  color: string;
}
const bloecke = Object.entries(SEITEN_FILES)
  .flatMap(([file, locale]) => {
    const source = path.join(dir, 'bloecke', file);
    return existsSync(source)
      ? (JSON.parse(readFileSync(source, 'utf8')) as BlockEntry[]).map((block) => ({
          ...block,
          locale,
        }))
      : [];
  })
  .filter((b) => only.size === 0 || only.has(b.id));
const vorschauFile = path.join(dir, 'vorschau-fotos.json');
const vorschau: Record<string, Record<string, string>> = existsSync(vorschauFile)
  ? (JSON.parse(readFileSync(vorschauFile, 'utf8')) as Record<string, Record<string, string>>)
  : {};
const MIME: Record<string, string> = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp' };
const dataUrl = (file: string) =>
  `data:image/${MIME[path.extname(file).slice(1).toLowerCase()] ?? 'jpeg'};base64,${readFileSync(file).toString('base64')}`;
/** The `vorlage:` photos a spec names, read from the catalogue's assets. */
const vorlagePhotos = (spec: unknown): [string, string][] =>
  [...new Set(JSON.stringify(spec).match(/"vorlage:[^"]+"/g) ?? [])].flatMap((quoted) => {
    const ref = quoted.slice(1, -1);
    // Mirrors `SHAREPIC_VORLAGE_REF`: the contracts package needs a build to load here.
    const file = /^vorlage:([a-z0-9][a-z0-9-]{0,62}\.(?:jpe?g|png|webp))$/.exec(ref)?.[1];
    return file ? [[ref, dataUrl(path.join(dir, 'assets', file))] as [string, string]] : [];
  });
const photosFor = (id: string, spec: unknown): Record<string, string> =>
  Object.fromEntries([
    ...vorlagePhotos(spec),
    ...Object.entries(vorschau[id] ?? {}).map(
      ([filename, file]) => [filename, dataUrl(path.join(dir, file))] as [string, string]
    ),
  ]);
mkdirSync(path.join(dir, 'thumbs', 'seiten'), { recursive: true });
mkdirSync(path.join(dir, 'thumbs', 'bloecke'), { recursive: true });

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
    photos: photosFor(entry.id, entry.spec),
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
// A Seite alone, in each format it claims: the preview is where an overflowing text shows.
for (const seite of seiten) {
  for (const format of seite.formats) {
    const result = await page.evaluate((input) => window.__sharepicHarness!.render(input), {
      spec: { locale: seite.locale, format, slides: [seite.slide] },
      photos: photosFor(seite.id, seite.slide),
    });
    if (!('images' in result)) {
      failed++;
      console.error(`seite ${seite.id} (${format}): ${result.error}`);
      continue;
    }
    writeFileSync(
      path.join(dir, 'thumbs', 'seiten', `${seite.id}.${format}.webp`),
      decode(await webp(result.images[0]!, THUMB_WIDTH))
    );
    process.stdout.write(`seite ${seite.id}: ${format}\n`);
  }
}
// A block alone on its ground, as the editor drops it: the preview is the block, not a slide.
for (const block of bloecke) {
  const spec = {
    locale: block.locale,
    slides: [
      {
        background: { kind: 'farbe', color: block.color },
        position: 'mitte',
        align: 'links',
        items: block.items,
        logo: false,
      },
    ],
  };
  const result = await page.evaluate((input) => window.__sharepicHarness!.renderBlock(input), {
    spec,
    photos: photosFor(block.id, spec),
  });
  if (!('image' in result)) {
    failed++;
    console.error(`block ${block.id}: ${result.error}`);
    continue;
  }
  writeFileSync(path.join(dir, 'thumbs', 'bloecke', `${block.id}.webp`), decode(result.image));
  process.stdout.write(`block ${block.id}\n`);
}
await browser.close();
process.stdout.write(
  `${entries.length}+${seiten.length}+${bloecke.length} entries, ${failed} failed render(s)\n`
);
process.exit(failed ? 1 : 0);
