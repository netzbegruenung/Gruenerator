import { columnIndex, type SheetOperation } from '@gruenerator/contracts';
import { CellValueType, type Serializable } from '@univerjs/core';
import { type FWorkbook, type FWorksheet } from '@univerjs/preset-sheets-core';

import { buildChartData } from './buildChartData.js';

/** Key under which SheetChartFloat is registered via univerAPI.registerComponent. */
export const SHEET_CHART_COMPONENT_KEY = 'GrueneratorSheetChart';

/** ISO date (yyyy-mm-dd, optional time) that we convert to an Excel serial. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/**
 * ISO date string → Excel serial number (epoch 1899-12-30; 25569 = 1970-01-01).
 * Done deterministically in code because the model must NOT emit the serial
 * itself — it can't compute the epoch and hallucinates wrong values (e.g.
 * "2026-03-15" came back as 43167 = 2018-03-07). The value is stored numeric;
 * a separate set_number_format op renders it as a date.
 */
export function isoToExcelSerial(iso: string): number {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : `${iso}Z`);
  return ms / 86_400_000 + 25569;
}

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

/** A1 column letter → 0-based index; throws (caught per-op) on an invalid letter. */
function toColumnIndex(at: string): number {
  const col = columnIndex(at);
  if (col < 0) throw new Error(`Ungültiger Spaltenbuchstabe: "${at}"`);
  return col;
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
          const range = resolveSheet(workbook, op.sheet).getRange(op.range);
          if (op.asText) {
            // Force TEXT identity (CellValueType.FORCE_STRING = 4) so ids, ZIPs,
            // leading zeros, and codes like "2-2" are never auto-inferred into a
            // number or date. Empty stays empty (null → '').
            range.setValues(
              op.values.map((row) =>
                row.map((v) => ({ v: v ?? '', t: CellValueType.FORCE_STRING }))
              )
            );
          } else {
            // Univer CellValue has no null — the schema's null means "empty cell".
            // ISO date strings are converted to Excel serials here (deterministic,
            // never trusting the model's own serial); the matching set_number_format
            // op renders them as dates and =A1+1 arithmetic stays date-correct.
            range.setValues(
              op.values.map((row) =>
                row.map((v) =>
                  typeof v === 'string' && ISO_DATE_RE.test(v) ? isoToExcelSerial(v) : (v ?? '')
                )
              )
            );
          }
          applied++;
          break;
        }
        case 'set_number_format': {
          // Display-only: sets the number/date/currency pattern without touching
          // the stored logical value (the correct way to render dates, %, €).
          resolveSheet(workbook, op.sheet).getRange(op.range).setNumberFormat(op.pattern);
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
        case 'insert_rows': {
          // `at` is a 1-based row number; insert BEFORE it (0-based index at-1).
          resolveSheet(workbook, op.sheet).insertRows(op.at - 1, op.count);
          applied++;
          break;
        }
        case 'delete_rows': {
          resolveSheet(workbook, op.sheet).deleteRows(op.at - 1, op.count);
          applied++;
          break;
        }
        case 'insert_columns': {
          resolveSheet(workbook, op.sheet).insertColumns(toColumnIndex(op.at), op.count);
          applied++;
          break;
        }
        case 'delete_columns': {
          resolveSheet(workbook, op.sheet).deleteColumns(toColumnIndex(op.at), op.count);
          applied++;
          break;
        }
        case 'merge_cells': {
          resolveSheet(workbook, op.sheet).getRange(op.range).merge();
          applied++;
          break;
        }
        case 'unmerge_cells': {
          resolveSheet(workbook, op.sheet).getRange(op.range).breakApart();
          applied++;
          break;
        }
        case 'add_chart': {
          // Read LOGICAL values (getCellDatas().v), not display strings, so
          // numbers stay numeric for the chart.
          const sheet = resolveSheet(workbook, op.sheet);
          const range = sheet.getRange(op.range);
          const values = range.getCellDatas().map((row) => (row ?? []).map((c) => c?.v ?? null));
          const data = buildChartData(values, op.chartType, op.title?.trim() || '');
          if (data.rows.length === 0 || data.seriesKeys.length === 0) {
            skipped.push('Diagramm übersprungen: kein auswertbarer Datenbereich.');
            break;
          }
          // Float DOM anchored to the data range: renders SheetChartFloat live,
          // moves/persists with the grid, and (being a drawing MUTATION) syncs
          // through the collab bridge + snapshot. Draggable via allowTransform.
          sheet.addFloatDomToRange(
            range,
            {
              componentKey: SHEET_CHART_COMPONENT_KEY,
              // Boundary cast: SheetChartData is JSON-serializable (all fields are
              // strings/numbers/arrays), but its typed shape lacks the index
              // signature Univer's Serializable requires.
              data: data as unknown as Serializable,
              allowTransform: true,
            },
            // A readable default size. Without width/height Univer sizes the box
            // to the source range's pixel extent (~100px for e.g. H1:J5), which
            // collapses the plot area and makes the bars invisible.
            { width: 480, height: 320 },
            `chart-${crypto.randomUUID()}`
          );
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
