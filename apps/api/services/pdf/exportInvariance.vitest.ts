/**
 * Die tragende Invariante des Dokument-Exports: kein Inhaltsverlust.
 *
 * Der Export hat seinen Renderer getauscht (handgeschriebenes Layout →
 * getaggter `renderPdf`). Der gefährlichste Fehler dabei ist nicht der
 * Absturz — der fällt auf —, sondern still verschluckter Inhalt. Genau das
 * tat der alte Renderer: `export-baseline.json` hält gemessen fest, dass er
 * Tabellen restlos und einzelne Listenpunkte verlor.
 *
 * Geprüft wird deshalb nur EINE Richtung: jedes sichtbare Wort der Quelle
 * kommt im Textlayer des PDF an. Titel, Datum und Fußzeile kommen legitim
 * hinzu und werden nicht gegengeprüft.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generatePdfBuffer } from '../../routes/exports/pdfController.js';

import {
  EXPORT_FIXTURES,
  missingWords,
  pdfText,
  visibleWords,
} from './__fixtures__/contentInvariance.js';

const FIXTURE_DIR = path.join(import.meta.dirname, '__fixtures__', 'export-content');

interface Baseline {
  fixtures: Record<string, { words: number; missing: number; pages: number }>;
}

const baseline = JSON.parse(
  await readFile(path.join(import.meta.dirname, '__fixtures__', 'export-baseline.json'), 'utf8')
) as Baseline;

async function renderFixture(file: string, title: string): Promise<string> {
  const source = await readFile(path.join(FIXTURE_DIR, file), 'utf8');
  return pdfText(await generatePdfBuffer(source, title));
}

describe('Dokument-Export: kein Inhaltsverlust', () => {
  for (const fixture of EXPORT_FIXTURES) {
    it(`überträgt jedes sichtbare Wort aus ${fixture.file}`, async () => {
      const source = await readFile(path.join(FIXTURE_DIR, fixture.file), 'utf8');
      const words = visibleWords(source, fixture.kind);
      const missing = missingWords(words, await renderFixture(fixture.file, fixture.name));

      expect(missing, `fehlend im PDF: ${missing.slice(0, 10).join(', ')}`).toEqual([]);
    }, 60_000);
  }

  it('ist auf keinem Fixture schlechter als der abgelöste Renderer', async () => {
    // Der Vergleichsmaßstab wurde VOR dem Umbau gegen den alten Renderer
    // gemessen; er kann nachträglich nicht passend gemacht worden sein.
    const worse: string[] = [];
    for (const fixture of EXPORT_FIXTURES) {
      const source = await readFile(path.join(FIXTURE_DIR, fixture.file), 'utf8');
      const missing = missingWords(
        visibleWords(source, fixture.kind),
        await renderFixture(fixture.file, fixture.name)
      );
      const before = baseline.fixtures[fixture.name]?.missing ?? 0;
      if (missing.length > before) worse.push(`${fixture.name}: ${before} → ${missing.length}`);
    }
    expect(worse).toEqual([]);
  }, 180_000);

  it('meldet Verlust tatsächlich, statt leer zu bestehen', async () => {
    // Kalibrierung: ohne diesen Gegentest könnten die Zusicherungen oben auch
    // dann grün sein, wenn die Wortliste leer bliebe oder die Suche immer
    // trifft. Ein Wort, das nachweislich nicht im Dokument steht, MUSS auffallen.
    const text = await renderFixture('markdown-basic.md', 'Kalibrierung');
    expect(missingWords(['Zeppelinhangar'], text)).toEqual(['zeppelinhangar']);
    // Und zwar auch dann, wenn das Wort im Dokument vorkommt — nur seltener:
    // eine reine Enthaltensein-Prüfung wäre hier grün.
    expect(missingWords(['stagniert', 'stagniert', 'stagniert'], text).length).toBeGreaterThan(0);
  }, 60_000);
});

describe('Dokument-Export: Struktur und Laufzeit', () => {
  it('taggt den Export, statt nur Text zu malen', async () => {
    const source = await readFile(path.join(FIXTURE_DIR, 'markdown-table.md'), 'utf8');
    const { verifyPdf } = await import('./pdfVerification.js');
    const { PDF_TYPE_AREA } = await import('./pdfRenderer.js');
    const result = await verifyPdf(await generatePdfBuffer(source, 'Haushalt'), PDF_TYPE_AREA);

    expect(result.problems).toEqual([]);
    expect(result.hasStructureTree).toBe(true);
    expect(result.isMarkedTagged).toBe(true);
    expect(result.hasUaIdentifier).toBe(true);
  }, 60_000);

  it('bricht ab, statt eine leere Datei auszuliefern', async () => {
    // Für chinesische Schrift hat keine eingebettete Schrift eine Glyphe.
    // Die Zeichen fallen heraus, die Seite ist leer — und weil sie formal
    // sauber getaggt ist, meldet weder veraPDF noch verifyPdf etwas.
    await expect(
      generatePdfBuffer('# 绿色政策纲要\n\n我们的目标是到2035年实现气候中和。', 'Politik')
    ).rejects.toThrow(/nicht darstellen/);
  }, 60_000);

  it('exportiert weiterhin, wenn nur einzelne Sonderzeichen fehlen', async () => {
    // Der Abbruch darf keine Kollateralschäden anrichten: ein paar Symbole
    // ohne Glyphe sind kein Grund, einen deutschen Text zu verweigern.
    const bytes = await generatePdfBuffer(
      'Ein ganz normaler deutscher Absatz mit einem seltenen Zeichen ⌘ darin.',
      'Normal'
    );
    expect(bytes.length).toBeGreaterThan(1000);
  }, 60_000);

  it('bleibt beim größten Fixture in einer vertretbaren Laufzeit', async () => {
    const source = await readFile(path.join(FIXTURE_DIR, 'edge-huge.md'), 'utf8');
    const started = performance.now();
    const bytes = await generatePdfBuffer(source, 'Großes Dokument');
    const elapsed = performance.now() - started;

    expect(bytes.length).toBeGreaterThan(0);
    // Grobe Obergrenze, damit der Export nicht unbemerkt von Hunderten
    // Millisekunden auf Sekunden wandert — keine Performance-Zusage.
    expect(elapsed).toBeLessThan(15_000);
  }, 60_000);
});
