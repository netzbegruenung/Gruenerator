/**
 * Kalibrierung der Tabellenerkennung an echten PDFs aus dem Repo und an
 * gebauten Seiten. Jede erkannte Seite kostet einen Mistral-OCR-Aufruf, ein
 * Fehlalarm also Geld; eine übersehene Tabelle kommt als pdfjs-Fliesstext an.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { pageHasTable } from './tableDetection.js';

import type { PdfTextItem } from './textItemJoin.js';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function tablePagesOf(relativePath: string): Promise<number[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const bytes = new Uint8Array(readFileSync(join(API_ROOT, relativePath)));
  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
  const hits: number[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const content = await (await doc.getPage(pageNum)).getTextContent();
    if (pageHasTable(content.items as PdfTextItem[])) hits.push(pageNum);
  }
  return hits;
}

/** Ein pdfjs-Item: Text an (x, y) in Schriftgrösse `size`, Breite geschätzt. */
function at(str: string, x: number, y: number, size = 10): PdfTextItem {
  return { str, transform: [size, 0, 0, size, x, y], width: str.length * size * 0.5 };
}

const PROSE = 'Wir wollen, dass alle Menschen in einer intakten Umwelt leben können und dass';

describe('Tabellenerkennung — echte PDFs', () => {
  it('erkennt die Dienstleister-Tabelle der Fixture (Seiten 3 und 4)', async () => {
    // Drei Spalten, die kürzeren Zellen vertikal mittig gesetzt: keine einzelne
    // Zeile trägt alle drei. Die zweispaltige Speicherfristen-Tabelle (Seite 5)
    // bleibt bewusst unerkannt.
    expect(await tablePagesOf('evals/extraction/__fixtures__/tabellen-pdf.pdf')).toEqual([3, 4]);
  }, 30_000);

  it.each([
    'public/20200125_Grundsatzprogramm.pdf',
    'public/20240306_Reader_EU-Wahlprogramm2024_A4.pdf',
    'public/20250318_Regierungsprogramm_DIGITAL_DINA5.pdf',
  ])(
    'findet in reinem Fliesstext keine Tabelle: %s',
    async (file) => {
      // Enthält Inhaltsverzeichnisse, ein Stichwortregister mit rechtsbündigen
      // Seitenzahlen und zweispaltige Seiten — alle drei hatten frühere Fassungen
      // der Regel als Tabelle gemeldet.
      expect(await tablePagesOf(file)).toEqual([]);
    },
    60_000
  );
});

describe('Tabellenerkennung — gebaute Seiten', () => {
  it('erkennt ein Raster aus 3 Zeilen × 3 Spalten', () => {
    const items = [700, 686, 672].flatMap((y, i) => [
      at(`Posten ${i}`, 60, y),
      at(`${i} Euro`, 220, y),
      at(`Ressort ${i}`, 380, y),
    ]);
    expect(pageHasTable(items)).toBe(true);
  });

  it('erkennt rechtsbündige Zahlenspalten am gemeinsamen Ende', () => {
    const rows: Array<[string, string, string]> = [
      ['Haushalt', '1.200', '98'],
      ['Klimaschutz', '15.000.000', '1.234'],
      ['Verkehr', '870', '5'],
    ];
    const items = rows.flatMap(([label, a, b], i) => {
      const y = 700 - i * 14;
      return [at(label, 60, y), at(a, 300 - a.length * 5, y), at(b, 450 - b.length * 5, y)];
    });
    expect(pageHasTable(items)).toBe(true);
  });

  it('meldet keine Tabelle bei einspaltigem Fliesstext', () => {
    const items = Array.from({ length: 20 }, (_, i) => at(PROSE, 60, 700 - i * 14));
    expect(pageHasTable(items)).toBe(false);
  });

  it('meldet keine Tabelle bei zweispaltigem Satz', () => {
    const items = Array.from({ length: 30 }, (_, i) => [
      at(PROSE.slice(0, 44), 60, 700 - i * 14),
      at(PROSE.slice(0, 44), 310, 700 - i * 14),
    ]).flat();
    expect(pageHasTable(items)).toBe(false);
  });

  it('meldet keine Tabelle bei Aufzählungen', () => {
    const bullets = Array.from({ length: 8 }, (_, i) => [
      at('•', 60, 700 - i * 14),
      at(PROSE.slice(0, 50), 74, 700 - i * 14),
    ]).flat();
    const numbered = Array.from({ length: 8 }, (_, i) => [
      at(`${i + 1}.`, 60, 500 - i * 14),
      at(PROSE.slice(0, 50), 80, 500 - i * 14),
    ]).flat();
    expect(pageHasTable(bullets)).toBe(false);
    expect(pageHasTable(numbered)).toBe(false);
  });

  it('meldet keine Tabelle bei nur zwei Zeilen', () => {
    const items = [700, 686].flatMap((y) => [at('a', 60, y), at('b', 220, y), at('c', 380, y)]);
    expect(pageHasTable(items)).toBe(false);
  });

  it('erkennt eine an den Inhalt angepasste Tabelle mit nur dem Zellpolster als Lücke', () => {
    // Geometrie aus einem Chromium-PDF einer gewöhnlichen Tabelle mit Rahmen
    // (4px Polster, 12pt): zwischen „1.250.000 €" und „1.310.000 €" liegen
    // 12,7 pt = 1,06 em. Mit der alten Schwelle von 2 em verschmolzen die drei
    // hinteren Spalten zu einer Zelle.
    const item = (str: string, x: number, width: number, y: number): PdfTextItem => ({
      str,
      transform: [12, 0, 0, 12, x, y],
      width,
    });
    const rows: Array<[string, number, string, number, string, number, string, number]> = [
      ['Posten', 40, '2025', 26.7, '2026', 26.7, 'Änderung', 56.7],
      ['Personal', 47.4, '1.250.000 €', 63.4, '1.310.000 €', 63.4, '+4,8 %', 37.7],
      ['Sachkosten', 62.7, '420.000 €', 53.4, '398.000 €', 53.4, '−5,2 %', 37.7],
      ['Investitionen', 67.4, '2.100.000 €', 63.4, '2.650.000 €', 63.4, '+26,2 %', 44.4],
    ];
    const items = rows.flatMap(([a, aw, b, bw, c, cw, d, dw], i) => {
      const y = 723.6 - i * 20.2;
      return [
        item(a, 63.4, aw, y),
        item(b, 143.6, bw, y),
        item(c, 219.7, cw, y),
        item(d, 295.9, dw, y),
      ];
    });
    expect(pageHasTable(items)).toBe(true);
  });

  it('zählt gedrehten Text nicht als Spalte', () => {
    // Nummerierte Absätze mit einer senkrechten Randmarke daneben: ohne den
    // Filter ergäben Nummer, Text und Randmarke drei Spalten.
    const items = [700, 686, 672].flatMap((y, i) => [
      at(`(${i + 55})`, 40, y),
      at(PROSE.slice(0, 40), 80, y),
      { str: 'Kapitel 1', transform: [0, 6, -6, 0, 402, y], width: 30 },
    ]);
    expect(pageHasTable(items)).toBe(false);
  });

  it('ignoriert Leerraum-Items, mit denen pdfjs Tabellenlücken füllt', () => {
    const items = [700, 686, 672].flatMap((y) => [
      at('Datenart', 60, y),
      { str: ' ', transform: [10, 0, 0, 10, 100, y], width: 120 },
      at('Frist', 220, y),
      at('Grund', 380, y),
    ]);
    expect(pageHasTable(items)).toBe(true);
  });
});
