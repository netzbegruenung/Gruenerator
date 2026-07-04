import { columnLabel, escapeMarkdownCell } from '@gruenerator/contracts';

import { type ICellData, type Nullable } from '@univerjs/core';
import type { FWorkbook } from '@univerjs/preset-sheets-core';

const MAX_ROWS = 200;
const MAX_COLS = 30;
const MAX_CHARS = 20_000;

/**
 * Classify each non-text column by its logical type + number format so the model
 * knows HOW to write changes: a date/currency/percent cell is a number + a
 * format (never a formatted string), a formula column holds `=…`. Plain text
 * columns are omitted to keep the legend short. Returns e.g. "B=Währung (Zahl +
 * Format), C=Datum (Zahl + Format), D=Formel".
 */
function describeColumnTypes(
  cellDatas: Nullable<ICellData>[][],
  numberFormats: string[][],
  cols: number
): string {
  const parts: string[] = [];
  for (let c = 0; c < cols; c++) {
    let hasFormula = false;
    let numericCells = 0;
    let nonEmpty = 0;
    let fmt = '';
    for (let r = 0; r < cellDatas.length; r++) {
      const cell = cellDatas[r]?.[c];
      if (cell?.f) hasFormula = true;
      const v = cell?.v;
      if (v !== null && v !== undefined && v !== '') {
        nonEmpty++;
        if (typeof v === 'number') numericCells++;
      }
      const nf = numberFormats[r]?.[c];
      if (!fmt && nf && nf.length > 0) fmt = nf;
    }
    if (nonEmpty === 0 && !hasFormula) continue; // empty column

    let kind: string | null = null;
    if (hasFormula) kind = 'Formel';
    else if (fmt) {
      const lower = fmt.toLowerCase();
      if (fmt.includes('%')) kind = 'Prozent (Zahl + Format)';
      else if (/[€$£¥¤]/.test(fmt)) kind = 'Währung (Zahl + Format)';
      else if (/[yd]/.test(lower)) kind = 'Datum (Zahl + Format)';
      else kind = 'Zahl (formatiert)';
    } else if (numericCells > 0 && numericCells >= nonEmpty / 2) kind = 'Zahl';
    // plain-text columns intentionally omitted

    if (kind) parts.push(`${columnLabel(c)}=${kind}`);
  }
  return parts.join(', ');
}

/**
 * Serializes the active sheet into a model-readable markdown table with A1
 * coordinates, capped for token budget. Sent as chat context and as the
 * sheet state for the AI planning endpoint.
 */
export function serializeSheetContext(workbook: FWorkbook): string {
  const lines: string[] = [];
  let charCount = 0;
  const push = (line: string) => {
    lines.push(line);
    charCount += line.length + 1; // +1 for the join newline
  };

  const sheets = workbook.getSheets();
  const active = workbook.getActiveSheet();

  push(
    `Arbeitsblätter: ${sheets.map((s) => (s.getSheetId() === active.getSheetId() ? `**${s.getSheetName()}** (aktiv)` : s.getSheetName())).join(', ')}`
  );

  const lastRow = active.getLastRow();
  const lastCol = active.getLastColumn();
  if (lastRow < 0 || lastCol < 0) {
    push('\nDas aktive Arbeitsblatt ist leer.');
    return lines.join('\n');
  }

  const rows = Math.min(lastRow + 1, MAX_ROWS);
  const cols = Math.min(lastCol + 1, MAX_COLS);
  const range = active.getRange(0, 0, rows, cols);
  // Logical cell model ({ v, t, f }) — NOT getValues(), which returns the
  // formatted display string (a date serial reads back as "2022-12-05"); writing
  // that string back would corrupt the typed cell. Display values are shown only
  // for formatted cells (readability), with the column legend flagging the type.
  const cellDatas = range.getCellDatas();
  const displays = range.getValues();
  const numberFormats = range.getNumberFormats();

  push(`\nAktives Blatt „${active.getSheetName()}" (A1:${columnLabel(cols - 1)}${rows}):\n`);

  const header = ['   ', ...Array.from({ length: cols }, (_, c) => columnLabel(c))];
  push(`| ${header.join(' | ')} |`);
  push(`| ${header.map(() => '---').join(' | ')} |`);

  for (let r = 0; r < rows; r++) {
    const cells = [`${r + 1}`];
    for (let c = 0; c < cols; c++) {
      const cell = cellDatas[r]?.[c];
      const numFmt = numberFormats[r]?.[c];
      let rendered: string | number | boolean;
      if (cell?.f && cell.f.length > 0) {
        rendered = cell.f; // formula text — what the model needs to see/edit
      } else if (numFmt && numFmt.length > 0) {
        rendered = displays[r]?.[c] ?? ''; // formatted (date/€/%) → show readable display
      } else {
        rendered = cell?.v ?? ''; // logical value (plain text/number)
      }
      cells.push(escapeMarkdownCell(rendered));
    }
    push(`| ${cells.join(' | ')} |`);
    if (charCount > MAX_CHARS) {
      push(`| … | (abgeschnitten bei Zeile ${r + 1} von ${rows}) |`);
      break;
    }
  }

  const legend = describeColumnTypes(cellDatas, numberFormats, cols);
  if (legend) push(`\nSpalten-Typen (beim Ändern beachten): ${legend}`);

  if (lastRow + 1 > rows || lastCol + 1 > cols) {
    push(
      `\n(Ausschnitt: ${rows}×${cols} von ${lastRow + 1}×${lastCol + 1} belegten Zeilen/Spalten)`
    );
  }

  return lines.join('\n');
}
