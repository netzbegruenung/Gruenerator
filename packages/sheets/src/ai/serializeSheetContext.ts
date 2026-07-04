import { columnLabel, escapeMarkdownCell } from '@gruenerator/contracts';

import type { FWorkbook } from '@univerjs/preset-sheets-core';

const MAX_ROWS = 200;
const MAX_COLS = 30;
const MAX_CHARS = 20_000;

/** Per-column tallies accumulated during the single render pass. */
interface ColumnStat {
  hasFormula: boolean;
  numeric: number;
  nonEmpty: number;
  fmt: string;
}

/**
 * Classify a column by its logical type + number format so the model knows HOW
 * to write changes: a date/currency/percent cell is a number + a format (never
 * a formatted string), a formula column holds `=…`. Returns null for empty or
 * plain-text columns (omitted to keep the legend short).
 */
function classifyColumn(st: ColumnStat): string | null {
  if (st.nonEmpty === 0 && !st.hasFormula) return null;
  if (st.hasFormula) return 'Formel';
  if (st.fmt) {
    const lower = st.fmt.toLowerCase();
    if (st.fmt.includes('%')) return 'Prozent (Zahl + Format)';
    if (/[€$£¥¤]/.test(st.fmt)) return 'Währung (Zahl + Format)';
    if (/[yd]/.test(lower)) return 'Datum (Zahl + Format)';
    return 'Zahl (formatiert)';
  }
  if (st.numeric > 0 && st.numeric >= st.nonEmpty / 2) return 'Zahl';
  return null; // plain-text columns intentionally omitted
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

  // Single pass: render each row AND accumulate per-column type tallies (no
  // second full scan for the legend). Cap BEFORE emitting a row that would push
  // the context past MAX_CHARS, so the output stays within budget.
  const colStats: ColumnStat[] = Array.from({ length: cols }, () => ({
    hasFormula: false,
    numeric: 0,
    nonEmpty: 0,
    fmt: '',
  }));
  for (let r = 0; r < rows; r++) {
    if (charCount > MAX_CHARS) {
      push(`| … | (abgeschnitten – Zeilen ${r + 1}–${rows} ausgelassen) |`);
      break;
    }
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

      const st = colStats[c]!;
      if (cell?.f) st.hasFormula = true;
      const v = cell?.v;
      if (v !== null && v !== undefined && v !== '') {
        st.nonEmpty++;
        if (typeof v === 'number') st.numeric++;
      }
      if (!st.fmt && numFmt && numFmt.length > 0) st.fmt = numFmt;
    }
    push(`| ${cells.join(' | ')} |`);
  }

  const legend = colStats
    .map((st, c) => {
      const kind = classifyColumn(st);
      return kind ? `${columnLabel(c)}=${kind}` : null;
    })
    .filter((x): x is string => x !== null)
    .join(', ');
  if (legend) push(`\nSpalten-Typen (beim Ändern beachten): ${legend}`);

  if (lastRow + 1 > rows || lastCol + 1 > cols) {
    push(
      `\n(Ausschnitt: ${rows}×${cols} von ${lastRow + 1}×${lastCol + 1} belegten Zeilen/Spalten)`
    );
  }

  return lines.join('\n');
}
