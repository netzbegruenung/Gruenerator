import type { SheetOperation } from '@gruenerator/contracts';
import type { FWorkbook, FWorksheet } from '@univerjs/preset-sheets-core';

export interface ApplySheetOperationsResult {
  applied: number;
  skipped: string[];
}

function resolveSheet(workbook: FWorkbook, sheetName: string | null | undefined): FWorksheet {
  if (sheetName) {
    const named = workbook.getSheetByName(sheetName);
    if (named) return named;
  }
  return workbook.getActiveSheet();
}

/**
 * Applies AI-planned operations to the live workbook via the Facade API.
 * Every facade call runs Univer COMMANDs, so the edits flow through the
 * mutation-log collab bridge (collaborators see them live) and land on the
 * native undo stack — Cmd+Z reverts an AI edit like any manual one.
 */
export function applySheetOperations(
  workbook: FWorkbook,
  operations: SheetOperation[]
): ApplySheetOperationsResult {
  let applied = 0;
  const skipped: string[] = [];

  for (const op of operations) {
    try {
      switch (op.type) {
        case 'set_range_values': {
          // Univer CellValue has no null — the schema's null means "empty cell".
          const values = op.values.map((row) => row.map((v) => v ?? ''));
          resolveSheet(workbook, op.sheet).getRange(op.range).setValues(values);
          applied++;
          break;
        }
        case 'set_formula': {
          resolveSheet(workbook, op.sheet).getRange(op.cell).setFormula(op.formula);
          applied++;
          break;
        }
        case 'format_range': {
          const range = resolveSheet(workbook, op.sheet).getRange(op.range);
          if (op.bold !== null && op.bold !== undefined) {
            range.setFontWeight(op.bold ? 'bold' : 'normal');
          }
          if (op.background) range.setBackgroundColor(op.background);
          if (op.fontColor) range.setFontColor(op.fontColor);
          applied++;
          break;
        }
        case 'add_sheet': {
          workbook.create(op.name, 1000, 26);
          applied++;
          break;
        }
        case 'clear_range': {
          resolveSheet(workbook, op.sheet).getRange(op.range).clearContent();
          applied++;
          break;
        }
        default: {
          // Exhaustive: new operation types must be handled explicitly.
          const unknown: never = op;
          skipped.push(`Unbekannte Operation: ${JSON.stringify(unknown).slice(0, 80)}`);
        }
      }
    } catch (err) {
      skipped.push(
        `${op.type} fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`
      );
    }
  }

  return { applied, skipped };
}
