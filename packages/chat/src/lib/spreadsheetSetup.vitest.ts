/**
 * Tests for the spreadsheet setup helpers — how an uploaded file becomes the
 * pandas `df` bootstrap, and the CSV/xlsx/legacy classification the worker and
 * the composer bridge share.
 */

import { describe, expect, it } from 'vitest';

import { buildFileSetup, isTabularFile, isXlsx, isXls } from './spreadsheetSetup';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet';

describe('isXlsx', () => {
  it('matches by .xlsx extension and by MIME', () => {
    expect(isXlsx('umsatz.xlsx', '')).toBe(true);
    expect(isXlsx('umsatz', XLSX_MIME)).toBe(true);
  });

  it('does not match CSV or legacy .xls', () => {
    expect(isXlsx('data.csv', 'text/csv')).toBe(false);
    expect(isXlsx('old.xls', XLS_MIME)).toBe(false);
  });
});

describe('buildFileSetup', () => {
  it('reads .xlsx via read_excel wrapped in the aggregate-row guard', () => {
    const setup = buildFileSetup('umsatz.xlsx', XLSX_MIME);
    expect(setup).toContain('_gruen_clean(pd.read_excel("umsatz.xlsx"))');
    expect(setup).toContain('def _gruen_clean(');
  });

  it('reads CSV with separator sniffing, encoding fallback and German-number normalization', () => {
    const setup = buildFileSetup('data.csv', 'text/csv');
    // Separator sniffing for German `;`-CSVs.
    expect(setup).toContain("sep=None, engine='python'");
    // Encoding fallback chain: BOM-tolerant UTF-8 first, then cp1252 (Excel).
    expect(setup).toContain("'utf-8-sig', 'cp1252'");
    // Decimal-comma columns ("1.234,56") get converted to floats.
    expect(setup).toContain('pd.to_numeric');
    // Loaded df goes through the trailing-aggregate-row guard (GESAMT rows).
    expect(setup).toContain('_gruen_clean(_gruen_load_csv("data.csv"))');
    // The exact runtime behavior is covered by the Pyodide integration suite
    // (runCore.integration.vitest.ts) against real pandas.
  });

  it('reads legacy .xls via read_excel wrapped in the aggregate-row guard', () => {
    const setup = buildFileSetup('alt.xls', XLS_MIME);
    expect(setup).toContain('_gruen_clean(pd.read_excel("alt.xls"))');
  });

  it('keeps the guard snippet free of typographic characters (sanitizer gotcha)', () => {
    // NBSP / smart quotes in the embedded Python would be a SyntaxError at
    // runtime. Built from code points because literal typographic characters
    // get silently normalized by editors/models - the exact failure mode
    // this test guards against.
    const typographic = new RegExp(
      `[${String.fromCharCode(0x00a0, 0x202f, 0x200b, 0x201c, 0x201d, 0x201e, 0x2018, 0x2019)}]`
    );
    const setup = buildFileSetup('umsatz.xlsx', XLSX_MIME);
    expect(setup).not.toMatch(typographic);
  });

  it('escapes odd file names safely into the Python literal', () => {
    expect(buildFileSetup('a"b.csv', 'text/csv')).toContain('"a\\"b.csv"');
  });
});

describe('isTabularFile (composer capture gate)', () => {
  it('captures CSV and every spreadsheet variant', () => {
    expect(isTabularFile('data.csv', 'text/csv')).toBe(true);
    expect(isTabularFile('x.xlsx', XLSX_MIME)).toBe(true);
    expect(isTabularFile('x.xls', XLS_MIME)).toBe(true);
  });

  it('ignores unrelated attachments and unsupported .ods', () => {
    expect(isTabularFile('foto.png', 'image/png')).toBe(false);
    expect(isTabularFile('brief.pdf', 'application/pdf')).toBe(false);
    // .ods has no offline pandas engine (odfpy ships no wheel) — treated as a
    // normal document, not captured for the interpreter.
    expect(isTabularFile('tabelle.ods', ODS_MIME)).toBe(false);
  });
});

describe('isXls', () => {
  it('flags .xls by extension and MIME, not .xlsx', () => {
    expect(isXls('a.xls', XLS_MIME)).toBe(true);
    expect(isXls('a.xlsx', XLSX_MIME)).toBe(false);
  });
});
