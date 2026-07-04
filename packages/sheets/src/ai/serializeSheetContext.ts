import { columnLabel, escapeMarkdownCell } from '@gruenerator/contracts';

import type { FWorkbook } from '@univerjs/preset-sheets-core';

const MAX_ROWS = 200;
const MAX_COLS = 30;
const MAX_CHARS = 20_000;

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
  const values = range.getValues();
  const formulas = range.getFormulas();

  push(`\nAktives Blatt „${active.getSheetName()}" (A1:${columnLabel(cols - 1)}${rows}):\n`);

  const header = ['   ', ...Array.from({ length: cols }, (_, c) => columnLabel(c))];
  push(`| ${header.join(' | ')} |`);
  push(`| ${header.map(() => '---').join(' | ')} |`);

  for (let r = 0; r < rows; r++) {
    const cells = [`${r + 1}`];
    for (let c = 0; c < cols; c++) {
      const formula = formulas[r]?.[c];
      const value = values[r]?.[c];
      const rendered = formula && formula.length > 0 ? formula : (value ?? '');
      cells.push(escapeMarkdownCell(rendered));
    }
    push(`| ${cells.join(' | ')} |`);
    if (charCount > MAX_CHARS) {
      push(`| … | (abgeschnitten bei Zeile ${r + 1} von ${rows}) |`);
      break;
    }
  }

  if (lastRow + 1 > rows || lastCol + 1 > cols) {
    push(
      `\n(Ausschnitt: ${rows}×${cols} von ${lastRow + 1}×${lastCol + 1} belegten Zeilen/Spalten)`
    );
  }

  return lines.join('\n');
}
