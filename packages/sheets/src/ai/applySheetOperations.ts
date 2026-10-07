import { columnIndex, type SheetOperation } from '@gruenerator/contracts';
import { BorderStyleTypes, BorderType, CellValueType } from '@univerjs/core';
import { type FUniver } from '@univerjs/presets';
import { type FWorkbook, type FWorksheet } from '@univerjs/preset-sheets-core';
// Side-effect imports: load the plugin Facade augmentations so FWorksheet/FRange
// gain the plugin methods (newConditionalFormattingRule, createFilter, addTable,
// sort, setDataValidation, createOrUpdateNote, setHyperLink,
// createTextFinderAsync) at the TYPE level. The plugins themselves are
// registered in createUniverInstance.
import { CFValueType } from '@univerjs/preset-sheets-conditional-formatting';
import '@univerjs/preset-sheets-data-validation';
import '@univerjs/preset-sheets-filter';
import '@univerjs/preset-sheets-find-replace';
import '@univerjs/preset-sheets-hyper-link';
import '@univerjs/preset-sheets-note';
import '@univerjs/preset-sheets-sort';
import '@univerjs/preset-sheets-table';

// TEMPORARILY DISABLED — chart rendering (add_chart) is a bespoke Univer float-DOM
// that renders as a full-table overlay, isn't removable, and doesn't undo. Re-enable
// with a proper fix (positioning/remove-UI/undo) in a dedicated PR.
// import { type Serializable } from '@univerjs/core';
// import { buildChartData } from './buildChartData.js';

/** Key under which SheetChartFloat is registered via univerAPI.registerComponent. */
export const SHEET_CHART_COMPONENT_KEY = 'GrueneratorSheetChart';

import { ISO_DATE_RE, isoToExcelSerial } from './dateSerial.js';

export { ISO_DATE_RE, isoToExcelSerial };

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

function requireSheet(workbook: FWorkbook, sheetName: string): FWorksheet {
  const sheet = workbook.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Arbeitsblatt „${sheetName}" nicht gefunden`);
  return sheet;
}

const BORDER_EDGES = {
  all: BorderType.ALL,
  outside: BorderType.OUTSIDE,
  inside: BorderType.INSIDE,
  top: BorderType.TOP,
  bottom: BorderType.BOTTOM,
  left: BorderType.LEFT,
  right: BorderType.RIGHT,
  none: BorderType.NONE,
} as const;

const BORDER_STYLES = {
  thin: BorderStyleTypes.THIN,
  medium: BorderStyleTypes.MEDIUM,
  thick: BorderStyleTypes.THICK,
  dashed: BorderStyleTypes.DASHED,
  dotted: BorderStyleTypes.DOTTED,
  double: BorderStyleTypes.DOUBLE,
} as const;

/** Univer's facade spells right-aligned as 'normal'. */
const HORIZONTAL_ALIGN = { left: 'left', center: 'center', right: 'normal' } as const;

const TEXT_LINE = { none: 'none', underline: 'underline', strikethrough: 'line-through' } as const;

/** Planner output is untrusted: only links a person can safely click. */
const SAFE_LINK_RE = /^(https?:\/\/|mailto:)/i;

const NOTE_SIZE = { width: 200, height: 80 } as const;

/**
 * Applies AI-planned operations to the live workbook via the Facade API.
 * Every facade call runs Univer COMMANDs, so the edits flow through the
 * mutation-log collab bridge (collaborators see them live) and land on the
 * native undo stack — Cmd+Z reverts an AI edit like any manual one.
 *
 * `univerAPI` (FUniver) is required for `set_data_validation` (its builder entry
 * is `univerAPI.newDataValidation()`); omitting it just skips that one op.
 * Async because `add_table` returns a Promise.
 */
export async function applySheetOperations(
  workbook: FWorkbook,
  operations: SheetOperation[],
  univerAPI?: FUniver
): Promise<ApplySheetOperationsResult> {
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
          if (op.bold != null) range.setFontWeight(op.bold ? 'bold' : 'normal');
          if (op.italic != null) range.setFontStyle(op.italic ? 'italic' : 'normal');
          if (op.textLine) range.setFontLine(TEXT_LINE[op.textLine]);
          if (op.fontSize) range.setFontSize(op.fontSize);
          if (op.background) range.setBackgroundColor(op.background);
          if (op.fontColor) range.setFontColor(op.fontColor);
          if (op.horizontalAlign)
            range.setHorizontalAlignment(HORIZONTAL_ALIGN[op.horizontalAlign]);
          if (op.verticalAlign) range.setVerticalAlignment(op.verticalAlign);
          if (op.wrap != null) range.setWrap(op.wrap);
          if (op.border) {
            range.setBorder(
              BORDER_EDGES[op.border.edges],
              op.border.edges === 'none'
                ? BorderStyleTypes.NONE
                : BORDER_STYLES[op.border.style ?? 'thin'],
              op.border.color ?? '#000000'
            );
          }
          applied++;
          break;
        }
        case 'clear_format': {
          resolveSheet(workbook, op.sheet).getRange(op.range).clearFormat();
          applied++;
          break;
        }
        case 'add_sheet': {
          workbook.create(op.name, 1000, 26);
          applied++;
          break;
        }
        case 'rename_sheet': {
          (op.sheet ? requireSheet(workbook, op.sheet) : workbook.getActiveSheet()).setName(
            op.name
          );
          applied++;
          break;
        }
        case 'delete_sheet': {
          const sheet = requireSheet(workbook, op.sheet);
          if (workbook.getSheets().length <= 1) {
            skipped.push('Das letzte Arbeitsblatt kann nicht gelöscht werden.');
            break;
          }
          workbook.deleteSheet(sheet);
          applied++;
          break;
        }
        case 'duplicate_sheet': {
          const copy = workbook.duplicateSheet(
            op.sheet ? requireSheet(workbook, op.sheet) : workbook.getActiveSheet()
          );
          if (op.name) copy.setName(op.name);
          applied++;
          break;
        }
        case 'set_tab_color': {
          resolveSheet(workbook, op.sheet).setTabColor(op.color);
          applied++;
          break;
        }
        case 'clear_range': {
          resolveSheet(workbook, op.sheet).getRange(op.range).clearContent();
          applied++;
          break;
        }
        case 'freeze_panes': {
          const sheet = resolveSheet(workbook, op.sheet);
          if (op.rows === 0 && op.columns === 0) sheet.cancelFreeze();
          else {
            // -1 = "no split on this axis", as Univer's own setFrozenRows writes it.
            sheet.setFreeze({
              xSplit: op.columns,
              ySplit: op.rows,
              startRow: op.rows > 0 ? op.rows : -1,
              startColumn: op.columns > 0 ? op.columns : -1,
            });
          }
          applied++;
          break;
        }
        case 'set_column_width': {
          const sheet = resolveSheet(workbook, op.sheet);
          const start = toColumnIndex(op.at);
          if (op.width) sheet.setColumnWidths(start, op.count, op.width);
          else sheet.autoResizeColumns(start, op.count);
          applied++;
          break;
        }
        case 'set_row_height': {
          const sheet = resolveSheet(workbook, op.sheet);
          if (op.height) sheet.setRowHeights(op.at - 1, op.count, op.height);
          else sheet.setRowAutoHeight(op.at - 1, op.count);
          applied++;
          break;
        }
        case 'autofill': {
          const sheet = resolveSheet(workbook, op.sheet);
          const ok = await sheet.getRange(op.source).autoFill(sheet.getRange(op.target));
          if (ok) applied++;
          else skipped.push(`Ausfüllen von ${op.source} nach ${op.target} nicht möglich.`);
          break;
        }
        case 'find_replace': {
          if (!univerAPI) {
            skipped.push('Ersetzen übersprungen: Editor-Kontext fehlt.');
            break;
          }
          const finder = await univerAPI.createTextFinderAsync(op.find);
          if (op.matchCase) await finder?.matchCaseAsync(true);
          if (op.entireCell) await finder?.matchEntireCellAsync(true);
          const count = finder ? await finder.replaceAllWithAsync(op.replace) : 0;
          if (count > 0) applied++;
          else skipped.push(`„${op.find}" wurde nicht gefunden.`);
          break;
        }
        case 'set_hyperlink': {
          const url = op.url.trim();
          if (!SAFE_LINK_RE.test(url)) {
            skipped.push(`Link übersprungen: nur http(s)- und mailto-Adressen erlaubt.`);
            break;
          }
          const range = resolveSheet(workbook, op.sheet).getRange(op.cell);
          if (await range.setHyperLink(url, op.label?.trim() || url)) applied++;
          else skipped.push(`Link in ${op.cell} konnte nicht gesetzt werden.`);
          break;
        }
        case 'set_note': {
          const range = resolveSheet(workbook, op.sheet).getRange(op.cell);
          if (op.text.trim()) range.createOrUpdateNote({ note: op.text, ...NOTE_SIZE });
          else range.deleteNote();
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
          // TEMPORARILY DISABLED — see the commented import block above. The
          // bespoke float-DOM chart renders as a full-table overlay, can't be
          // removed, and doesn't respond to undo. Skip cleanly (the model is
          // also told not to emit add_chart, see sheetAiService prompt) until a
          // proper Univer chart integration lands.
          skipped.push('Diagramme sind vorübergehend deaktiviert.');
          break;
          /* Original implementation — restore with the proper fix:
          const sheet = resolveSheet(workbook, op.sheet);
          const range = sheet.getRange(op.range);
          const values = range.getCellDatas().map((row) => (row ?? []).map((c) => c?.v ?? null));
          const data = buildChartData(values, op.chartType, op.title?.trim() || '');
          if (data.rows.length === 0 || data.seriesKeys.length === 0) {
            skipped.push('Diagramm übersprungen: kein auswertbarer Datenbereich.');
            break;
          }
          sheet.addFloatDomToRange(
            range,
            {
              componentKey: SHEET_CHART_COMPONENT_KEY,
              data: data as unknown as Serializable,
              allowTransform: true,
            },
            { width: 480, height: 320 },
            `chart-${crypto.randomUUID()}`
          );
          applied++;
          break;
          */
        }
        case 'add_conditional_format': {
          const sheet = resolveSheet(workbook, op.sheet);
          const irange = sheet.getRange(op.range).getRange();
          const rule = op.rule;
          // Base builder → condition method returns the highlight builder → style
          // setters → setRanges → build → addConditionalFormattingRule.
          let hb;
          if (rule.kind === 'cell_number') {
            const base = sheet.newConditionalFormattingRule();
            const hi = rule.value2 ?? rule.value;
            switch (rule.operator) {
              case 'greater_than':
                hb = base.whenNumberGreaterThan(rule.value);
                break;
              case 'greater_equal':
                hb = base.whenNumberGreaterThanOrEqualTo(rule.value);
                break;
              case 'less_than':
                hb = base.whenNumberLessThan(rule.value);
                break;
              case 'less_equal':
                hb = base.whenNumberLessThanOrEqualTo(rule.value);
                break;
              case 'equal':
                hb = base.whenNumberEqualTo(rule.value);
                break;
              case 'not_equal':
                hb = base.whenNumberNotEqualTo(rule.value);
                break;
              case 'between':
                hb = base.whenNumberBetween(rule.value, hi);
                break;
              case 'not_between':
                hb = base.whenNumberNotBetween(rule.value, hi);
                break;
            }
            if (rule.background) hb = hb.setBackground(rule.background);
            if (rule.fontColor) hb = hb.setFontColor(rule.fontColor);
            if (rule.bold != null) hb = hb.setBold(rule.bold);
          } else if (rule.kind === 'text_contains') {
            hb = sheet.newConditionalFormattingRule().whenTextContains(rule.text);
            if (rule.background) hb = hb.setBackground(rule.background);
            if (rule.fontColor) hb = hb.setFontColor(rule.fontColor);
            if (rule.bold != null) hb = hb.setBold(rule.bold);
          } else if (rule.kind === 'color_scale') {
            const stops: { color: string; value: { type: CFValueType; value?: number } }[] = [
              { color: rule.minColor, value: { type: CFValueType.min } },
            ];
            if (rule.midColor) {
              stops.push({
                color: rule.midColor,
                value: { type: CFValueType.percentile, value: 50 },
              });
            }
            stops.push({ color: rule.maxColor, value: { type: CFValueType.max } });
            hb = sheet
              .newConditionalFormattingRule()
              .setColorScale(stops.map((stop, index) => ({ index, ...stop })));
          } else {
            hb = sheet.newConditionalFormattingRule().setDataBar({
              min: { type: CFValueType.min },
              max: { type: CFValueType.max },
              positiveColor: rule.color,
              nativeColor: rule.negativeColor ?? '#e53935',
              isGradient: rule.gradient ?? true,
            });
          }
          sheet.addConditionalFormattingRule(hb.setRanges([irange]).build());
          applied++;
          break;
        }
        case 'remove_conditional_formats': {
          resolveSheet(workbook, op.sheet).getRange(op.range).clearConditionalFormatRules();
          applied++;
          break;
        }
        case 'remove_data_validation': {
          const rules = resolveSheet(workbook, op.sheet).getRange(op.range).getDataValidations();
          for (const rule of rules) rule.delete();
          if (rules.length > 0) applied++;
          else skipped.push(`In ${op.range} gibt es keine Datenprüfung.`);
          break;
        }
        case 'remove_filter': {
          const filter = resolveSheet(workbook, op.sheet).getFilter();
          if (filter) {
            filter.remove();
            applied++;
          } else skipped.push('Auf dem Blatt ist kein Filter aktiv.');
          break;
        }
        case 'remove_table': {
          const table = workbook.getTableInfoByName(op.name);
          if (table && (await workbook.removeTable(table.id))) applied++;
          else skipped.push(`Tabelle „${op.name}" nicht gefunden.`);
          break;
        }
        case 'set_data_validation': {
          if (!univerAPI) {
            skipped.push('Datenprüfung übersprungen: Editor-Kontext fehlt.');
            break;
          }
          const range = resolveSheet(workbook, op.sheet).getRange(op.range);
          const rule = op.rule;
          const b = univerAPI.newDataValidation();
          let built;
          if (rule.kind === 'list') {
            built = b.requireValueInList(rule.values, rule.multiple ?? false, true);
          } else if (rule.kind === 'checkbox') {
            built = b.requireCheckbox();
          } else if (rule.kind === 'number') {
            const hi = rule.value2 ?? rule.value;
            switch (rule.operator) {
              case 'between':
                built = b.requireNumberBetween(rule.value, hi);
                break;
              case 'not_between':
                built = b.requireNumberNotBetween(rule.value, hi);
                break;
              case 'greater_than':
                built = b.requireNumberGreaterThan(rule.value);
                break;
              case 'greater_equal':
                built = b.requireNumberGreaterThanOrEqualTo(rule.value);
                break;
              case 'less_than':
                built = b.requireNumberLessThan(rule.value);
                break;
              case 'less_equal':
                built = b.requireNumberLessThanOrEqualTo(rule.value);
                break;
              case 'equal':
                built = b.requireNumberEqualTo(rule.value);
                break;
              case 'not_equal':
                built = b.requireNumberNotEqualTo(rule.value);
                break;
            }
          } else {
            const d1 = new Date(rule.date);
            const d2 = rule.date2 ? new Date(rule.date2) : d1;
            switch (rule.operator) {
              case 'after':
                built = b.requireDateAfter(d1);
                break;
              case 'before':
                built = b.requireDateBefore(d1);
                break;
              case 'between':
                built = b.requireDateBetween(d1, d2);
                break;
              case 'equal':
                built = b.requireDateEqualTo(d1);
                break;
              case 'on_or_after':
                built = b.requireDateOnOrAfter(d1);
                break;
              case 'on_or_before':
                built = b.requireDateOnOrBefore(d1);
                break;
            }
          }
          range.setDataValidation(built.build());
          applied++;
          break;
        }
        case 'sort_range': {
          const sheet = resolveSheet(workbook, op.sheet);
          const range = sheet.getRange(op.range);
          // fRange.sort() column index is relative to the range's first column.
          const relCol = toColumnIndex(op.column) - range.getRange().startColumn;
          if (relCol < 0) {
            skipped.push(`Sortierspalte ${op.column} liegt außerhalb von ${op.range}.`);
            break;
          }
          range.sort({ column: relCol, ascending: op.ascending });
          applied++;
          break;
        }
        case 'create_filter': {
          const sheet = resolveSheet(workbook, op.sheet);
          // Only one filter per sheet — drop an existing one so createFilter()
          // doesn't return null.
          sheet.getFilter()?.remove();
          sheet.getRange(op.range).createFilter();
          applied++;
          break;
        }
        case 'add_table': {
          const sheet = resolveSheet(workbook, op.sheet);
          const r = sheet.getRange(op.range).getRange();
          const name = op.name?.trim() || `Tabelle_${crypto.randomUUID().slice(0, 8)}`;
          await sheet.addTable(name, {
            startRow: r.startRow,
            startColumn: r.startColumn,
            endRow: r.endRow,
            endColumn: r.endColumn,
          });
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
