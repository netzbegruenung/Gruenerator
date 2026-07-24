/**
 * Baseline of the CURRENTLY LIVE document export (generatePdfBuffer).
 *
 * Recorded before the renderer is swapped, so the replacement can be held
 * against a measurement instead of an expectation. Written after the fact it
 * would be worthless.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument } from 'pdf-lib';
import * as prettier from 'prettier';

import { generatePdfBuffer } from '../routes/exports/pdfController.js';
import {
  EXPORT_FIXTURES,
  missingWords,
  pdfText,
  visibleWords,
} from '../services/pdf/__fixtures__/contentInvariance.js';

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'services',
  'pdf',
  '__fixtures__'
);
const contentDir = path.join(fixturesDir, 'export-content');
const outFile = path.join(fixturesDir, 'export-baseline.json');

interface BaselineEntry {
  words: number;
  missing: number;
  missingSample: string[];
  pages: number;
  crashed: boolean;
  error: string | null;
}

const results: Record<string, BaselineEntry> = {};

for (const fixture of EXPORT_FIXTURES) {
  const source = await readFile(path.join(contentDir, fixture.file), 'utf8');
  const words = visibleWords(source, fixture.kind);

  try {
    const bytes = await generatePdfBuffer(source, fixture.name);
    const text = await pdfText(bytes);
    const missing = missingWords(words, text);
    const pages = (await PDFDocument.load(bytes)).getPageCount();

    results[fixture.name] = {
      words: words.length,
      missing: missing.length,
      missingSample: missing.slice(0, 10),
      pages,
      crashed: false,
      error: null,
    };
  } catch (err) {
    // A crash of the old renderer is a legitimate baseline result.
    results[fixture.name] = {
      words: words.length,
      missing: words.length,
      missingSample: words.slice(0, 10),
      pages: 0,
      crashed: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const r = results[fixture.name];
  console.log(
    `${fixture.name.padEnd(22)} words=${String(r.words).padStart(5)} missing=${String(r.missing).padStart(5)} pages=${r.pages}${r.crashed ? ` CRASH: ${r.error}` : ''}`
  );
}

const json = JSON.stringify({
  renderer: 'routes/exports/pdfController.ts#generatePdfBuffer',
  generatedAt: new Date().toISOString(),
  note: 'Wörter sind dedupliziert; Vergleich Quelle ⊆ PDF-Textebene.',
  fixtures: results,
});

// Formatted the same way as any checked-in file, so a re-run produces no diff noise.
await writeFile(outFile, await prettier.format(json, { parser: 'json' }), 'utf8');

console.log(`\nBaseline in ${outFile}`);
