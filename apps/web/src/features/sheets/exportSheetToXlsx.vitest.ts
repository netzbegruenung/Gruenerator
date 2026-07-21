import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { buildXlsxWorkbook, toXlsxFilename } from './exportSheetToXlsx';

import type { IWorkbookData } from '@gruenerator/sheets';

// Minimal snapshot: values of each JS type + a formula cell across two sheets,
// with sheet names that need sanitising and dedup.
const snapshot = {
  id: 'doc-1',
  sheetOrder: ['s1', 's2'],
  sheets: {
    s1: {
      id: 's1',
      name: 'Umsatz/2024',
      cellData: {
        0: { 0: { v: 'Name' }, 1: { v: 'Betrag' } },
        1: { 0: { v: 'Ada' }, 1: { v: 42 } },
        2: { 0: { v: 'Grace' }, 1: { v: 8 } },
        3: { 1: { f: '=SUM(B2:B3)' } },
      },
    },
    s2: {
      id: 's2',
      name: 'Umsatz/2024',
      cellData: { 0: { 0: { v: true } } },
    },
  },
} as unknown as IWorkbookData;

describe('buildXlsxWorkbook', () => {
  it('carries values and preserves formulas (without the leading =)', () => {
    const book = buildXlsxWorkbook(XLSX, snapshot);
    const ws = book.Sheets[book.SheetNames[0]];

    expect((ws['A2'] as XLSX.CellObject).v).toBe('Ada');
    expect((ws['B2'] as XLSX.CellObject).t).toBe('n');
    expect((ws['B2'] as XLSX.CellObject).v).toBe(42);
    expect((ws['B4'] as XLSX.CellObject).f).toBe('SUM(B2:B3)');
  });

  it('keeps boolean cell type', () => {
    const book = buildXlsxWorkbook(XLSX, snapshot);
    const ws = book.Sheets[book.SheetNames[1]];
    expect((ws['A1'] as XLSX.CellObject).t).toBe('b');
    expect((ws['A1'] as XLSX.CellObject).v).toBe(true);
  });

  it('sanitises and de-duplicates sheet names (Excel limits)', () => {
    const book = buildXlsxWorkbook(XLSX, snapshot);
    // "/" is illegal in a sheet name → replaced; the duplicate gets a suffix.
    expect(book.SheetNames[0]).toBe('Umsatz 2024');
    expect(book.SheetNames[1]).not.toBe(book.SheetNames[0]);
    expect(book.SheetNames.every((n) => n.length <= 31)).toBe(true);
  });

  it('round-trips through a real xlsx write/read', () => {
    const book = buildXlsxWorkbook(XLSX, snapshot);
    const buf = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const reread = XLSX.read(buf, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      reread.Sheets[reread.SheetNames[0]]
    );
    expect(rows[0]).toMatchObject({ Name: 'Ada', Betrag: 42 });
  });

  it('never yields a zero-sheet book', () => {
    const empty = { id: 'x', sheetOrder: [], sheets: {} } as unknown as IWorkbookData;
    const book = buildXlsxWorkbook(XLSX, empty);
    expect(book.SheetNames.length).toBe(1);
  });
});

describe('toXlsxFilename', () => {
  it('strips an existing spreadsheet extension and illegal chars, appends .xlsx', () => {
    expect(toXlsxFilename('Mitglieder: Q1/Q2.csv')).toBe('Mitglieder Q1Q2.xlsx');
  });
  it('keeps a dot that is part of the title, not an extension', () => {
    expect(toXlsxFilename('Budget v1.2')).toBe('Budget v1.2.xlsx');
    expect(toXlsxFilename('Kennzahlen Q1.2 final')).toBe('Kennzahlen Q1.2 final.xlsx');
  });
  it('falls back for an empty title', () => {
    expect(toXlsxFilename('   ')).toBe('Tabelle.xlsx');
  });
});
