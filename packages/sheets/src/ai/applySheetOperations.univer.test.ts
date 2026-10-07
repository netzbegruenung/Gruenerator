// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { SheetOperation } from '@gruenerator/contracts';
import type { FUniver } from '@univerjs/presets';
import type { FWorkbook } from '@univerjs/preset-sheets-core';

// Runs the AI ops against a real, headless Univer 1.0.3 instead of a fake: the
// facade's spelling quirks (right-align is 'normal', freeze uses -1 for "no
// split") are exactly what a fake would encode wrongly in both places.
//
// Not covered here, because their commands come from UI plugins that need the
// full workbench: find_replace (find-replace service) and fit-to-content
// widths (sheet.command.set-col-auto-width, registered by sheets-ui).
//
// The presets import their UI halves, which touch Path2D at module scope;
// jsdom has none. Stub it before the dynamic imports below.
(globalThis as { Path2D?: unknown }).Path2D ??= class {};

const { LocaleType, Univer, UniverInstanceType } = await import('@univerjs/core');
const { FUniver: FUniverImpl } = await import('@univerjs/core/facade');
const core = await import('@univerjs/preset-sheets-core');
const { default: deDE } = await import('@univerjs/preset-sheets-core/locales/de-DE');
const { UniverSheetsConditionalFormattingPlugin } =
  await import('@univerjs/preset-sheets-conditional-formatting');
const { UniverDataValidationPlugin, UniverSheetsDataValidationPlugin } =
  await import('@univerjs/preset-sheets-data-validation');
const { UniverSheetsFilterPlugin } = await import('@univerjs/preset-sheets-filter');
const { UniverSheetsHyperLinkPlugin } = await import('@univerjs/preset-sheets-hyper-link');
const { UniverSheetsNotePlugin } = await import('@univerjs/preset-sheets-note');
const { UniverSheetsSortPlugin } = await import('@univerjs/preset-sheets-sort');
const { UniverSheetsTablePlugin } = await import('@univerjs/preset-sheets-table');
const { applySheetOperations } = await import('./applySheetOperations.js');
const { serializeSheetContext } = await import('./serializeSheetContext.js');

function setup(): { api: FUniver; workbook: FWorkbook } {
  const univer = new Univer({ locale: LocaleType.DE_DE, locales: { [LocaleType.DE_DE]: deDE } });
  for (const plugin of [
    core.UniverRenderEnginePlugin,
    core.UniverFormulaEnginePlugin,
    core.UniverSheetsPlugin,
    core.UniverSheetsFormulaPlugin,
    UniverSheetsConditionalFormattingPlugin,
    UniverDataValidationPlugin,
    UniverSheetsDataValidationPlugin,
    UniverSheetsFilterPlugin,
    UniverSheetsSortPlugin,
    UniverSheetsTablePlugin,
    UniverSheetsNotePlugin,
    UniverSheetsHyperLinkPlugin,
  ]) {
    univer.registerPlugin(plugin as never);
  }
  const rows = [
    ['Ort', 'Stimmen'],
    ['Altstadt', 120],
    ['Nordstadt', 80],
    ['Altstadt Ost', 45],
  ];
  const cellData = Object.fromEntries(
    rows.map((row, r) => [r, Object.fromEntries(row.map((v, c) => [c, { v }]))])
  );
  univer.createUnit(UniverInstanceType.UNIVER_SHEET, {
    id: 'wb',
    sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 'Wahl', cellData, rowCount: 100, columnCount: 20 } },
  });
  const api = FUniverImpl.newAPI(univer) as unknown as FUniver;
  return { api, workbook: api.getActiveWorkbook()! };
}

async function run(ops: SheetOperation[]) {
  const ctx = setup();
  const result = await applySheetOperations(ctx.workbook, ops, ctx.api);
  return { ...ctx, ...result, sheet: ctx.workbook.getActiveSheet() };
}

describe('applySheetOperations against Univer 1.0.3', () => {
  it('format_range sets font, alignment, wrap and border', async () => {
    const { sheet, skipped } = await run([
      {
        type: 'format_range',
        range: 'A1:B1',
        italic: true,
        textLine: 'underline',
        fontSize: 14,
        horizontalAlign: 'right',
        verticalAlign: 'middle',
        wrap: true,
        border: { edges: 'all', style: 'medium', color: '#46962b' },
      },
    ]);
    expect(skipped).toEqual([]);
    const style = sheet.getRange('B1').getCellStyleData()!;
    expect(style.it).toBe(1);
    expect(style.ul?.s).toBe(1);
    expect(style.fs).toBe(14);
    expect(style.ht).toBe(3); // HorizontalAlign.RIGHT
    expect(style.vt).toBe(2); // VerticalAlign.MIDDLE
    expect(style.tb).toBe(3); // WrapStrategy.WRAP
    expect(style.bd?.b?.s).toBe(8); // BorderStyleTypes.MEDIUM
  });

  it('clear_format removes styling but keeps the value', async () => {
    const { sheet } = await run([
      { type: 'format_range', range: 'A1', bold: true, fontSize: 20 },
      { type: 'clear_format', range: 'A1' },
    ]);
    expect(sheet.getRange('A1').getCellStyleData()?.fs).toBeUndefined();
    expect(sheet.getRange('A1').getValue()).toBe('Ort');
  });

  it('manages sheets: duplicate, rename, tab color, delete', async () => {
    const { workbook, skipped } = await run([
      { type: 'duplicate_sheet', name: 'Wahl Kopie' },
      { type: 'rename_sheet', sheet: 'Wahl', name: 'Ergebnis' },
      { type: 'set_tab_color', sheet: 'Ergebnis', color: '#46962b' },
      { type: 'delete_sheet', sheet: 'Wahl Kopie' },
      { type: 'delete_sheet', sheet: 'Ergebnis' },
    ]);
    expect(workbook.getSheets().map((s) => s.getSheetName())).toEqual(['Ergebnis']);
    expect(workbook.getSheetByName('Ergebnis')!.getTabColor()).toBe('#46962b');
    expect(skipped).toEqual(['Das letzte Arbeitsblatt kann nicht gelöscht werden.']);
  });

  it('freeze_panes freezes and unfreezes', async () => {
    const frozen = await run([{ type: 'freeze_panes', rows: 1, columns: 0 }]);
    expect(frozen.sheet.getFreeze()).toMatchObject({ ySplit: 1, xSplit: 0, startRow: 1 });
    const thawed = await run([
      { type: 'freeze_panes', rows: 1, columns: 1 },
      { type: 'freeze_panes', rows: 0, columns: 0 },
    ]);
    expect(thawed.sheet.getFreeze()).toMatchObject({ ySplit: 0, xSplit: 0 });
  });

  it('sets column width and row height', async () => {
    const { sheet, applied, skipped } = await run([
      { type: 'set_column_width', at: 'B', count: 2, width: 160 },
      { type: 'set_row_height', at: 1, count: 1, height: 40 },
    ]);
    expect(skipped).toEqual([]);
    expect(applied).toBe(2);
    expect(sheet.getColumnWidth(1)).toBe(160);
    expect(sheet.getColumnWidth(2)).toBe(160);
    expect(sheet.getRowHeight(0)).toBe(40);
  });

  it('autofill continues a number series', async () => {
    const { sheet, skipped } = await run([
      { type: 'set_range_values', range: 'D1:D2', values: [[1], [2]] },
      { type: 'autofill', source: 'D1:D2', target: 'D1:D5' },
    ]);
    expect(skipped).toEqual([]);
    expect(sheet.getRange('D5').getValue()).toBe(5);
  });

  it('set_hyperlink links safe URLs and refuses others', async () => {
    const { sheet, skipped } = await run([
      { type: 'set_hyperlink', cell: 'C1', url: 'https://gruene.de', label: 'Grüne' },
      { type: 'set_hyperlink', cell: 'C2', url: 'javascript:alert(1)' },
    ]);
    expect(
      sheet
        .getRange('C1')
        .getHyperLinks()
        .map((l) => l.url)
    ).toEqual(['https://gruene.de']);
    expect(sheet.getRange('C2').getHyperLinks()).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  it('set_note adds and removes a note', async () => {
    const added = await run([{ type: 'set_note', cell: 'B2', text: 'Quelle: Wahlamt' }]);
    expect(added.sheet.getNotes().map((n) => n.note)).toEqual(['Quelle: Wahlamt']);
    const removed = await run([
      { type: 'set_note', cell: 'B2', text: 'Quelle: Wahlamt' },
      { type: 'set_note', cell: 'B2', text: '' },
    ]);
    expect(removed.sheet.getNotes()).toEqual([]);
  });

  it('adds color scale and data bar rules, then removes them', async () => {
    const added = await run([
      {
        type: 'add_conditional_format',
        range: 'B2:B4',
        rule: {
          kind: 'color_scale',
          minColor: '#f8696b',
          midColor: '#ffeb84',
          maxColor: '#63be7b',
        },
      },
      {
        type: 'add_conditional_format',
        range: 'B2:B4',
        rule: { kind: 'data_bar', color: '#46962b' },
      },
    ]);
    expect(added.skipped).toEqual([]);
    expect(
      added.sheet
        .getConditionalFormattingRules()
        .map((r) => r.rule.type)
        .sort()
    ).toEqual(['colorScale', 'dataBar']);
    const removed = await run([
      { type: 'add_conditional_format', range: 'B2:B4', rule: { kind: 'data_bar', color: '#000' } },
      { type: 'remove_conditional_formats', range: 'B2:B4' },
    ]);
    expect(removed.sheet.getConditionalFormattingRules()).toEqual([]);
  });

  it('removes data validation, filter and table', async () => {
    const { workbook, sheet, skipped } = await run([
      { type: 'set_data_validation', range: 'C2:C4', rule: { kind: 'checkbox' } },
      { type: 'remove_data_validation', range: 'C2:C4' },
      { type: 'create_filter', range: 'A1:B4' },
      { type: 'remove_filter' },
      { type: 'add_table', range: 'A1:B4', name: 'Stimmen' },
      { type: 'remove_table', name: 'Stimmen' },
      { type: 'remove_table', name: 'Gibtsnicht' },
    ]);
    expect(sheet.getDataValidations()).toEqual([]);
    expect(sheet.getFilter()).toBeNull();
    expect(workbook.getTableList()).toEqual([]);
    expect(skipped).toEqual(['Tabelle „Gibtsnicht" nicht gefunden.']);
  });
});

describe('serializeSheetContext structure section', () => {
  it('lists what the cell grid cannot show', async () => {
    const { workbook } = await run([
      { type: 'freeze_panes', rows: 1, columns: 0 },
      { type: 'merge_cells', range: 'D1:E1' },
      { type: 'create_filter', range: 'A1:B4' },
      { type: 'set_note', cell: 'B2', text: 'Quelle:\nWahlamt' },
      { type: 'set_formula', cell: 'C2', formula: '=B2/0' },
      {
        type: 'add_conditional_format',
        range: 'B2:B4',
        rule: { kind: 'data_bar', color: '#46962b' },
      },
    ]);
    const context = serializeSheetContext(workbook);
    expect(context).toContain('Struktur des aktiven Blatts:');
    expect(context).toContain('- Fixiert: 1 Zeile(n), 0 Spalte(n)');
    expect(context).toContain('- Verbundene Zellen: D1:E1');
    expect(context).toContain('- Filter aktiv: A1:B4');
    expect(context).toContain('- Bedingte Formate: B2:B4 (dataBar)');
    expect(context).toContain('- Notizen: B2 „Quelle: Wahlamt“');
  });
});
