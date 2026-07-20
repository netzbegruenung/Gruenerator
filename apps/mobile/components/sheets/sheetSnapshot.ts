/**
 * Minimal, local view of the Univer IWorkbookData snapshot — only the fields a
 * read-only grid reads. Deliberately NOT importing any @univerjs/* type so the
 * heavy Univer runtime never enters the mobile bundle; the content endpoint
 * returns this as opaque JSON and we narrow it here.
 */
export interface RawCellStyle {
  bg?: { rgb?: string };
  cl?: { rgb?: string };
  bl?: number; // bold
  ht?: number; // horizontal align: 1 left, 2 center, 3 right
}

export interface RawCell {
  v?: string | number | boolean | null;
  s?: string | RawCellStyle;
}

export interface RawWorksheet {
  name?: string;
  cellData?: Record<string, Record<string, RawCell>>;
  columnData?: Record<string, { w?: number; hd?: number }>;
  rowData?: Record<string, { h?: number; hd?: number }>;
  mergeData?: Array<{ startRow: number; startColumn: number; endRow: number; endColumn: number }>;
  defaultColumnWidth?: number;
  defaultRowHeight?: number;
}

export interface WorkbookSnapshot {
  sheetOrder?: string[];
  sheets?: Record<string, RawWorksheet>;
  styles?: Record<string, RawCellStyle>;
}

export const DEFAULT_COL_WIDTH = 90;
export const DEFAULT_ROW_HEIGHT = 28;
/** Cap the rendered grid so a huge (mostly empty) sheet stays fast. */
const MAX_ROWS = 500;
const MAX_COLS = 60;

export interface OrderedSheet {
  id: string;
  name: string;
  sheet: RawWorksheet;
}

/** Sheets in `sheetOrder`, falling back to object key order. */
export function orderedSheets(wb: WorkbookSnapshot | null): OrderedSheet[] {
  if (!wb?.sheets) return [];
  const ids = wb.sheetOrder?.length ? wb.sheetOrder : Object.keys(wb.sheets);
  return ids
    .filter((id) => wb.sheets?.[id])
    .map((id) => ({ id, name: wb.sheets![id].name || 'Tabelle', sheet: wb.sheets![id] }));
}

/** Highest populated row/col (+1 each), capped — so we don't render empty 1000×26 grids. */
export function usedRange(sheet: RawWorksheet): { rows: number; cols: number } {
  let maxRow = 0;
  let maxCol = 0;
  const cd = sheet.cellData ?? {};
  for (const rowKey of Object.keys(cd)) {
    const r = Number(rowKey);
    if (r > maxRow) maxRow = r;
    for (const colKey of Object.keys(cd[rowKey] ?? {})) {
      const c = Number(colKey);
      if (c > maxCol) maxCol = c;
    }
  }
  for (const m of sheet.mergeData ?? []) {
    if (m.endRow > maxRow) maxRow = m.endRow;
    if (m.endColumn > maxCol) maxCol = m.endColumn;
  }
  return {
    rows: Math.min(maxRow + 1, MAX_ROWS),
    cols: Math.min(maxCol + 1, MAX_COLS),
  };
}

export function columnWidth(sheet: RawWorksheet, col: number): number {
  return sheet.columnData?.[String(col)]?.w ?? sheet.defaultColumnWidth ?? DEFAULT_COL_WIDTH;
}

export function rowHeight(sheet: RawWorksheet, row: number): number {
  return sheet.rowData?.[String(row)]?.h ?? sheet.defaultRowHeight ?? DEFAULT_ROW_HEIGHT;
}

export function cellAt(sheet: RawWorksheet, row: number, col: number): RawCell | undefined {
  return sheet.cellData?.[String(row)]?.[String(col)];
}

export function cellText(cell: RawCell | undefined): string {
  if (!cell || cell.v == null) return '';
  return String(cell.v);
}

/** Resolve a cell's style, whether inline or a styles-table id reference. */
export function resolveStyle(
  wb: WorkbookSnapshot,
  cell: RawCell | undefined
): RawCellStyle | undefined {
  if (!cell?.s) return undefined;
  if (typeof cell.s === 'string') return wb.styles?.[cell.s];
  return cell.s;
}

export function alignFor(ht?: number): 'left' | 'center' | 'right' {
  if (ht === 2) return 'center';
  if (ht === 3) return 'right';
  return 'left';
}

/** Cells covered by a merge (excluding the top-left anchor) → rendered blank. */
export function coveredCells(sheet: RawWorksheet): Set<string> {
  const covered = new Set<string>();
  for (const m of sheet.mergeData ?? []) {
    for (let r = m.startRow; r <= m.endRow; r++) {
      for (let c = m.startColumn; c <= m.endColumn; c++) {
        if (r === m.startRow && c === m.startColumn) continue;
        covered.add(`${r}:${c}`);
      }
    }
  }
  return covered;
}
