import type { FWorkbook } from '@univerjs/preset-sheets-core';

const MAX_ROWS = 200;
const MAX_COLS = 30;
const MAX_CHARS = 20_000;

function columnLabel(index: number): string {
  let label = '';
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
}

/**
 * Serializes the active sheet into a model-readable markdown table with A1
 * coordinates, capped for token budget. Sent as chat context and as the
 * sheet state for the AI planning endpoint.
 */
export function serializeSheetContext(workbook: FWorkbook): string {
  const lines: string[] = [];
  const sheets = workbook.getSheets();
  const active = workbook.getActiveSheet();

  lines.push(
    `Arbeitsblätter: ${sheets.map((s) => (s.getSheetId() === active.getSheetId() ? `**${s.getSheetName()}** (aktiv)` : s.getSheetName())).join(', ')}`
  );

  const lastRow = active.getLastRow();
  const lastCol = active.getLastColumn();
  if (lastRow < 0 || lastCol < 0) {
    lines.push('\nDas aktive Arbeitsblatt ist leer.');
    return lines.join('\n');
  }

  const rows = Math.min(lastRow + 1, MAX_ROWS);
  const cols = Math.min(lastCol + 1, MAX_COLS);
  const range = active.getRange(0, 0, rows, cols);
  const values = range.getValues();
  const formulas = range.getFormulas();

  lines.push(`\nAktives Blatt „${active.getSheetName()}" (A1:${columnLabel(cols - 1)}${rows}):\n`);

  const header = ['   ', ...Array.from({ length: cols }, (_, c) => columnLabel(c))];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);

  for (let r = 0; r < rows; r++) {
    const cells = [`${r + 1}`];
    for (let c = 0; c < cols; c++) {
      const formula = formulas[r]?.[c];
      const value = values[r]?.[c];
      const rendered = formula && formula.length > 0 ? formula : (value ?? '');
      cells.push(String(rendered).replaceAll('|', '\\|').replaceAll('\n', ' ').slice(0, 120));
    }
    lines.push(`| ${cells.join(' | ')} |`);
    if (lines.join('\n').length > MAX_CHARS) {
      lines.push(`| … | (abgeschnitten bei Zeile ${r + 1} von ${rows}) |`);
      break;
    }
  }

  if (lastRow + 1 > rows || lastCol + 1 > cols) {
    lines.push(
      `\n(Ausschnitt: ${rows}×${cols} von ${lastRow + 1}×${lastCol + 1} belegten Zeilen/Spalten)`
    );
  }

  return lines.join('\n');
}
