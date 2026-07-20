import { type FUniver, type IWorkbookData } from '@gruenerator/sheets';

import type * as XLSXNS from 'xlsx';

/**
 * Client-side .xlsx export for Univer sheets. Univer Pro's exchange-client
 * (server round-trip) isn't licensed, so we serialise the workbook snapshot to
 * a SheetJS workbook in the browser and trigger a download. Values + formulas
 * are carried; styling is intentionally dropped (SheetJS community build can't
 * write most cell styles anyway).
 */

type UniverCell = { v?: string | number | boolean | null; f?: string | null } | null | undefined;
type UniverCellRow = Record<string, UniverCell> | null | undefined;

const MAX_SHEET_NAME = 31; // Excel hard limit.

/** Map a Univer cell to a SheetJS cell, or null to skip empty cells. */
function toSheetCell(cell: UniverCell): XLSXNS.CellObject | null {
  if (!cell) return null;
  const value = cell.v;
  const formula =
    typeof cell.f === 'string' && cell.f.length > 0 ? cell.f.replace(/^=/, '') : undefined;
  if ((value === null || value === undefined) && !formula) return null;

  if (typeof value === 'number') return { t: 'n', v: value, ...(formula ? { f: formula } : {}) };
  if (typeof value === 'boolean') return { t: 'b', v: value, ...(formula ? { f: formula } : {}) };
  // Formula-only cell (no cached result yet) — Excel recomputes on open.
  if (value === null || value === undefined) return { t: 's', v: '', f: formula };
  return { t: 's', v: String(value), ...(formula ? { f: formula } : {}) };
}

/** Build a SheetJS worksheet from a Univer `cellData` matrix. */
function cellDataToSheet(
  XLSX: typeof XLSXNS,
  cellData: Record<string, UniverCellRow> | undefined
): XLSXNS.WorkSheet {
  const ws: XLSXNS.WorkSheet = {};
  let maxRow = 0;
  let maxCol = 0;
  let hasCell = false;

  for (const [rowKey, cols] of Object.entries(cellData ?? {})) {
    if (!cols) continue;
    const r = Number(rowKey);
    for (const [colKey, cell] of Object.entries(cols)) {
      const out = toSheetCell(cell);
      if (!out) continue;
      const c = Number(colKey);
      ws[XLSX.utils.encode_cell({ r, c })] = out;
      hasCell = true;
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
  }

  ws['!ref'] = hasCell
    ? XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } })
    : 'A1';
  return ws;
}

/** Excel-safe, unique sheet name (≤31 chars, no `[]:*?/\`). */
function safeSheetName(name: string, index: number, used: Set<string>): string {
  const base =
    name
      .replace(/[[\]:*?/\\]/g, ' ')
      .trim()
      .slice(0, MAX_SHEET_NAME) || `Tabelle${index + 1}`;
  let candidate = base;
  let n = 1;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `-${n++}`;
    candidate = base.slice(0, MAX_SHEET_NAME - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Convert a Univer workbook snapshot into a SheetJS workbook. Pure — no DOM,
 * so it is unit-testable. `XLSX` is injected to keep the heavy lib lazy.
 */
export function buildXlsxWorkbook(XLSX: typeof XLSXNS, snapshot: IWorkbookData): XLSXNS.WorkBook {
  const book = XLSX.utils.book_new();
  const used = new Set<string>();

  (snapshot.sheetOrder ?? []).forEach((sheetId, index) => {
    const sheet = snapshot.sheets?.[sheetId];
    if (!sheet) return;
    const ws = cellDataToSheet(XLSX, sheet.cellData as Record<string, UniverCellRow> | undefined);
    XLSX.utils.book_append_sheet(book, ws, safeSheetName(sheet.name ?? '', index, used));
  });

  // SheetJS refuses to write a book with zero sheets.
  if (book.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([[]]), 'Tabelle1');
  }
  return book;
}

/** Turn a document title into a safe `.xlsx` filename. */
export function toXlsxFilename(title: string): string {
  const base =
    title
      .replace(/\.[^.]+$/, '')
      .replace(/[/\\?%*:|"<>]/g, '')
      .trim() || 'Tabelle';
  return `${base}.xlsx`;
}

/**
 * Serialise the active workbook and download it as `.xlsx`. Lazy-loads SheetJS
 * (~1.8 MB) only when a user actually exports. No-op if no workbook is active.
 */
export async function downloadActiveWorkbookAsXlsx(
  univerAPI: FUniver,
  title: string
): Promise<void> {
  const workbook = univerAPI.getActiveWorkbook();
  if (!workbook) return;
  const snapshot = workbook.save();
  const XLSX = await import('xlsx');
  const book = buildXlsxWorkbook(XLSX, snapshot);
  XLSX.writeFileXLSX(book, toXlsxFilename(title));
}
