/**
 * `__fixtures__/haushalt.xlsx` ist mit openpyxl gebaut, also mit den
 * Zahlformaten, Datumsformaten und Blatt-Zuständen, die Excel selbst schreibt —
 * der SheetJS-Writer verliert eigene Zahlformate und taugt dafür nicht.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { smartChunkDocument } from '../TextChunker/index.js';

import { DocumentReadError } from './processingError.js';
import { MAX_TABLE_ROWS, spreadsheetToMarkdown } from './spreadsheetText.js';

const fixture = (name: string): Buffer =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', name));

const workbook = (sheets: Record<string, unknown[][]>, bookType: XLSX.BookType): Buffer => {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType }) as Buffer;
};

describe('spreadsheetToMarkdown — Excel', () => {
  it('schreibt jedes sichtbare Blatt als Markdown-Tabelle, Werte wie Excel sie zeigt', () => {
    expect(spreadsheetToMarkdown(fixture('haushalt.xlsx'), '.xlsx')).toBe(
      [
        '## Haushalt 2026',
        '',
        'Haushaltsplan Kreisverband',
        '',
        '| Posten | Ansatz 2025 | Ansatz 2026 | Änderung | Beschluss |  |',
        '| --- | --- | --- | --- | --- | --- |',
        '| Personal | 1.250.000,00 € | 1.310.000 € | 4,8% | 12.03.2026 | Notiz mit \\| Pipe und Zeilenumbruch |',
        '| Sachkosten | 420.000,50 € | 398.000 € | -5,2% | 12.03.2026 |  |',
        '| Investitionen | 2.100.000,00 € | 2.650.000 € | 26,2% | 03.04.2026 14:30 |  |',
        '| Summe | 3.770.000,50 € | 4.358.000 € |  |  |  |',
        '| PLZ | 01067 |  |  |  |  |',
        '',
        '## Mitglieder',
        '',
        '| Name | Ort | Eintritt |',
        '| --- | --- | --- |',
        '| Müller | Dresden | 01.05.2019 |',
      ].join('\n')
    );
  });

  it('liest ODS und altes XLS', () => {
    const rows = [
      ['Ort', 'Stimmen'],
      ['Bonn', 1234.5],
    ];
    for (const [ext, bookType] of [
      ['.ods', 'ods'],
      ['.xls', 'biff8'],
    ] as const) {
      expect(spreadsheetToMarkdown(workbook({ Ergebnis: rows }, bookType), ext)).toBe(
        '## Ergebnis\n\n| Ort | Stimmen |\n| --- | --- |\n| Bonn | 1234,5 |'
      );
    }
  });
});

describe('spreadsheetToMarkdown — CSV', () => {
  it('erkennt das Semikolon und lässt die Werte unverändert', () => {
    const csv = Buffer.from('Ort;PLZ;Betrag\nDresden;01067;1.234,50\n');
    expect(spreadsheetToMarkdown(csv, '.csv')).toBe(
      '| Ort | PLZ | Betrag |\n| --- | --- | --- |\n| Dresden | 01067 | 1.234,50 |'
    );
  });

  it('liest eine von Excel gespeicherte CSV in Windows-1252', () => {
    const csv = Buffer.from('Partei;Stimmen\nGrüne;412\n', 'latin1');
    expect(spreadsheetToMarkdown(csv, '.csv')).toContain('| Grüne | 412 |');
  });

  it('maskiert Backslash und Pipe, damit keine Zelle eine Spalte dazuerfindet', () => {
    // Ohne den Backslash wurde aus `a\|b` → `a\\|b`: ein Backslash und ein echter Trenner.
    const csv = Buffer.from('Pfad;Notiz\nC:\\Daten;a\\|b\n');
    expect(spreadsheetToMarkdown(csv, '.csv')).toContain('| C:\\\\Daten | a\\\\\\|b |');
  });

  it('lässt die UTF-8-BOM nicht in der ersten Spalte stehen', () => {
    const csv = Buffer.from('\uFEFFName,Ort\nMüller,Bonn\n');
    expect(spreadsheetToMarkdown(csv, '.csv').startsWith('| Name | Ort |')).toBe(true);
  });
});

describe('spreadsheetToMarkdown — Grenzen', () => {
  it(`weist mehr als ${MAX_TABLE_ROWS} Zeilen mit einer lesbaren Meldung ab`, () => {
    const csv = Buffer.from(
      ['a;b', ...Array.from({ length: MAX_TABLE_ROWS + 5 }, (_, i) => `${i};x`)].join('\n')
    );
    expect(() => spreadsheetToMarkdown(csv, '.csv')).toThrow(DocumentReadError);
    expect(() => spreadsheetToMarkdown(csv, '.csv')).toThrow(/mehr als 20\.000 Zeilen/);
  });
});

describe('spreadsheetToMarkdown → Chunker', () => {
  it('gibt jedem Chunk einer großen Tabelle die Spaltenköpfe mit', async () => {
    const csv = Buffer.from(
      [
        'Wahlbezirk;Gemeinde;Grüne;SPD',
        ...Array.from({ length: 500 }, (_, i) => `${i};Gemeinde ${i % 37};${i * 7};${i * 11}`),
      ].join('\n')
    );
    const chunks = await smartChunkDocument(spreadsheetToMarkdown(csv, '.csv'), {
      preserveSentences: true,
    });

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.text.startsWith('| Wahlbezirk | Gemeinde | Grüne | SPD |\n| --- |')).toBe(true);
    }
  });
});
