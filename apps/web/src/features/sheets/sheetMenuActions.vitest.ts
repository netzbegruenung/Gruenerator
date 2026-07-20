import { describe, expect, it, vi } from 'vitest';

import { createSheetMenuActions, SHEET_MENU_COMMAND_IDS } from './sheetMenuActions';

import type { FUniver } from '@gruenerator/sheets';

/** Build a mock FUniver + the spies the actions touch. */
function makeApi(opts: { filter?: { remove: () => void } | null } = {}) {
  const filter = opts.filter ?? null;
  const range = {
    createFilter: vi.fn(),
    getColumn: vi.fn(() => 2),
    getRange: vi.fn(() => ({ startRow: 0, startColumn: 2, endRow: 5, endColumn: 4 })),
  };
  const sheet = {
    getFilter: vi.fn(() => filter),
    getActiveRange: vi.fn(() => range),
    sort: vi.fn(),
    addTable: vi.fn(),
  };
  const workbook = { getActiveSheet: vi.fn(() => sheet) };
  const executeCommand = vi.fn<(id: string, params?: unknown, options?: unknown) => void>();
  const api = {
    getActiveWorkbook: vi.fn(() => workbook),
    executeCommand,
  } as unknown as FUniver;
  return { api, sheet, range, executeCommand };
}

describe('createSheetMenuActions', () => {
  it('toggleFilter creates a filter on the active range when none exists', () => {
    const { api, range } = makeApi({ filter: null });
    createSheetMenuActions(api).toggleFilter();
    expect(range.createFilter).toHaveBeenCalledOnce();
  });

  it('toggleFilter removes the filter when one already exists', () => {
    const remove = vi.fn();
    const { api, range } = makeApi({ filter: { remove } });
    createSheetMenuActions(api).toggleFilter();
    expect(remove).toHaveBeenCalledOnce();
    expect(range.createFilter).not.toHaveBeenCalled();
  });

  it('sort sorts by the active range start column in the requested direction', () => {
    const { api, sheet } = makeApi();
    createSheetMenuActions(api).sort(true);
    expect(sheet.sort).toHaveBeenCalledWith(2, true);
    createSheetMenuActions(api).sort(false);
    expect(sheet.sort).toHaveBeenLastCalledWith(2, false);
  });

  it('insertTable adds a table over the active range', () => {
    const { api, sheet } = makeApi();
    createSheetMenuActions(api).insertTable();
    expect(sheet.addTable).toHaveBeenCalledWith('Tabelle', {
      startRow: 0,
      startColumn: 2,
      endRow: 5,
      endColumn: 4,
    });
  });

  it('panel/dialog actions dispatch the exact verified command ids', () => {
    const { api, executeCommand } = makeApi();
    const actions = createSheetMenuActions(api);
    actions.openDataValidation();
    actions.openConditionalFormatting();
    actions.openFindReplace();
    actions.openZen();
    actions.toggleCrosshair();
    expect(executeCommand.mock.calls.map((c) => c[0])).toEqual([
      SHEET_MENU_COMMAND_IDS.dataValidation,
      SHEET_MENU_COMMAND_IDS.conditionalFormatting,
      SHEET_MENU_COMMAND_IDS.findReplace,
      SHEET_MENU_COMMAND_IDS.zen,
      SHEET_MENU_COMMAND_IDS.crosshair,
    ]);
  });

  it('no-ops without throwing when there is no active workbook', () => {
    const api = { getActiveWorkbook: () => null, executeCommand: vi.fn() } as unknown as FUniver;
    const actions = createSheetMenuActions(api);
    expect(() => {
      actions.toggleFilter();
      actions.sort(true);
      actions.insertTable();
    }).not.toThrow();
  });
});
