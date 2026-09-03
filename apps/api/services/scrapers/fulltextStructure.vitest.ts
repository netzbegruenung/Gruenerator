import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Die Aufruforte, an denen aus HTML Fließtext wird, der danach als `full_text`
 * abgelegt und an `smartChunkDocument` übergeben wird. Jeder von ihnen hat den
 * Text einmal durch `.replace(/\s+/g, ' ')` gedrückt; danach hatte `full_text`
 * keinen einzigen Zeilenumbruch, `segmentBlocks` sah genau eine Zeile, und der
 * Struktur-Pfad des Chunkers war per Konstruktion unerreichbar (#3163).
 *
 * Der Riegel liest den QUELLTEXT, weil das Kaputte eine einzelne Zeile ist, die
 * jederzeit als „Whitespace normalisieren" zurückkommt und die kein Typcheck
 * sieht. Die inhaltliche Zusicherung steht in `utils/htmlCleaner.vitest.ts`;
 * diese hier hält die Aufruforte.
 *
 * `BoellStiftungScraper.ts` steht bewusst NICHT in der Liste: sein Fließtext
 * kommt über `utils/contentExtractor.ts`, und sein eigenes
 * `.replace(/\s+/g, '-')` (`:475`) ist ein Slug-Bauer und soll bleiben.
 */
const EXTRACTION_SOURCES = [
  'implementations/BundestagScraper/BundestagScraper.ts',
  'implementations/GrueneAtScraper.ts',
  'implementations/GruenblogScraper.ts',
  'implementations/WebsiteCrawler.ts',
  'utils/contentExtractor.ts',
];

/**
 * Der manuelle Markup-Check spiegelt nur die Selektor-Reihenfolge aus
 * `BundestagScraper.#fetchPage`, nicht den Struktur-Pfad — er ruft
 * `htmlToStructuredText` nicht auf. Er bekommt deshalb nur die negative
 * Zusicherung (final-review.md, Befund 3): kein `.replace(/\s+/g, ' ')`, aber
 * keine Pflicht zu `htmlToStructuredText(`.
 */
const NEGATIVE_ONLY_SOURCES = ['implementations/BundestagScraper/BundestagScraper.manual-test.ts'];

/** Genau `.replace(/\s+/g, ' ')`. Ein Slug-Bauer (`, '-'`) ist nicht gemeint. */
const WHITESPACE_COLLAPSE = /\.replace\(\/\\s\+\/g,\s*' '\)/;

function assertNoWhitespaceCollapse(relative: string): void {
  it(`${relative} drückt keinen Fließtext platt`, () => {
    const source = fs.readFileSync(path.join(here, relative), 'utf8');
    const offenders = source
      .split('\n')
      .map((text, i) => ({ line: i + 1, text: text.trim() }))
      .filter((entry) => WHITESPACE_COLLAPSE.test(entry.text));

    expect(offenders).toEqual([]);
  });
}

describe('Fließtext-Extraktion erhält Blockgrenzen (#3163)', () => {
  for (const relative of EXTRACTION_SOURCES) {
    assertNoWhitespaceCollapse(relative);

    it(`${relative} geht über htmlToStructuredText`, () => {
      const source = fs.readFileSync(path.join(here, relative), 'utf8');

      expect(source).toContain('htmlToStructuredText(');
    });
  }

  for (const relative of NEGATIVE_ONLY_SOURCES) {
    assertNoWhitespaceCollapse(relative);
  }
});
