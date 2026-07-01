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
  it('reads .xlsx via read_excel', () => {
    expect(buildFileSetup('umsatz.xlsx', XLSX_MIME)).toBe(
      'import pandas as pd\ndf = pd.read_excel("umsatz.xlsx")'
    );
  });

  it('reads CSV with separator sniffing', () => {
    expect(buildFileSetup('data.csv', 'text/csv')).toBe(
      'import pandas as pd\ndf = pd.read_csv("data.csv", sep=None, engine=\'python\')'
    );
  });

  it('reads legacy .xls via read_excel (xlrd engine)', () => {
    expect(buildFileSetup('alt.xls', XLS_MIME)).toBe(
      'import pandas as pd\ndf = pd.read_excel("alt.xls")'
    );
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
