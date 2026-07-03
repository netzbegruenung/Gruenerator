import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it, vi } from 'vitest';

import { describeWorkbookSheets, extractXlsxSheetNames } from './xlsxSheetNames.js';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function syntheticWorkbook(sheetTags: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    'xl/workbook.xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><workbook><sheets>${sheetTags}</sheets></workbook>`
    )
  );
  return zip.toBuffer();
}

// Real user workbook checked in as the Pyodide fixture (4 sheets).
const FIXTURE = path.resolve(
  __dirname,
  '../../../../../packages/chat/src/pyodide/fixtures/excel_test_tabelle.xlsx'
);

describe('extractXlsxSheetNames', () => {
  it.skipIf(!existsSync(FIXTURE))('reads the sheet map of a real workbook in order', () => {
    expect(extractXlsxSheetNames(readFileSync(FIXTURE))).toEqual([
      'Mitarbeiter',
      'Zeiterfassung',
      'Aufgaben',
      'Lösungen',
    ]);
  });

  it('unescapes XML entities in sheet names', () => {
    const bytes = syntheticWorkbook(
      '<sheet name="Umsatz &amp; Kosten" sheetId="1"/><sheet name="Q1&lt;2024&gt;" sheetId="2"/>'
    );
    expect(extractXlsxSheetNames(bytes)).toEqual(['Umsatz & Kosten', 'Q1<2024>']);
  });

  it('returns null for non-zip bytes and zips without a workbook', () => {
    expect(extractXlsxSheetNames(Buffer.from('kein zip'))).toBeNull();
    const zip = new AdmZip();
    zip.addFile('irgendwas.txt', Buffer.from('x'));
    expect(extractXlsxSheetNames(zip.toBuffer())).toBeNull();
  });
});

describe('describeWorkbookSheets', () => {
  it('describes multi-sheet workbooks with the sheets[] convention', () => {
    const bytes = syntheticWorkbook(
      '<sheet name="Daten" sheetId="1"/><sheet name="Archiv" sheetId="2"/>'
    );
    const note = describeWorkbookSheets(bytes);
    expect(note).toContain('Arbeitsmappe mit 2 Blättern: Daten, Archiv');
    expect(note).toContain("df das Blatt 'Daten'");
    expect(note).toContain("sheets['Blattname']");
  });

  it('stays silent for single-sheet workbooks and unreadable bytes', () => {
    expect(describeWorkbookSheets(syntheticWorkbook('<sheet name="Nur" sheetId="1"/>'))).toBeNull();
    expect(describeWorkbookSheets(Buffer.from('kaputt'))).toBeNull();
  });
});
