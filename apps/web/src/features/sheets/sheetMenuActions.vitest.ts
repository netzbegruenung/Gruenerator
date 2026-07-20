import { describe, expect, it, vi } from 'vitest';

import { createSheetMenuActions, SHEET_MENU_COMMAND_IDS } from './sheetMenuActions';

import type { FUniver } from '@gruenerator/sheets';

/** Build a mock FUniver + the spies the actions touch. */
function makeApi(
  opts: {
    filter?: { remove: () => void } | null;
    single?: boolean;
    addTable?: (name: string) => boolean | Promise<boolean>;
  } = {}
) {
  const filter = opts.filter ?? null;
  // A single-cell selection reports width/height 1 → actions expand to data range.
  const dim = opts.single ? 1 : 3;
  const dataRange = {
    createFilter: vi.fn(),
    getColumn: vi.fn(() => 0),
    getWidth: vi.fn(() => 10),
    getHeight: vi.fn(() => 10),
    getRange: vi.fn(() => ({ startRow: 0, startColumn: 0, endRow: 9, endColumn: 9 })),
  };
  const range = {
    createFilter: vi.fn(),
    getColumn: vi.fn(() => 2),
    getWidth: vi.fn(() => dim),
    getHeight: vi.fn(() => dim),
    getRange: vi.fn(() => ({ startRow: 0, startColumn: 2, endRow: 5, endColumn: 4 })),
  };
  const sheet = {
    getFilter: vi.fn(() => filter),
    getActiveRange: vi.fn(() => range),
    getDataRange: vi.fn(() => dataRange),
    sort: vi.fn(),
    addTable: vi.fn(opts.addTable ?? (() => true)),
  };
  const workbook = { getActiveSheet: vi.fn(() => sheet) };
  const executeCommand = vi.fn<(id: string, params?: unknown, options?: unknown) => void>();
  const api = {
    getActiveWorkbook: vi.fn(() => workbook),
    executeCommand,
  } as unknown as FUniver;
  return { api, sheet, range, dataRange, executeCommand };
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

  it('insertTable adds a table over the active range', async () => {
    const { api, sheet } = makeApi();
    const ok = await createSheetMenuActions(api).insertTable();
    expect(ok).toBe(true);
    expect(sheet.addTable).toHaveBeenCalledWith('Tabelle', {
      startRow: 0,
      startColumn: 2,
      endRow: 5,
      endColumn: 4,
    });
  });

  it('insertTable expands a single-cell selection to the data range', async () => {
    const { api, sheet, dataRange } = makeApi({ single: true });
    await createSheetMenuActions(api).insertTable();
    expect(sheet.getDataRange).toHaveBeenCalled();
    expect(sheet.addTable).toHaveBeenCalledWith('Tabelle', {
      startRow: 0,
      startColumn: 0,
      endRow: 9,
      endColumn: 9,
    });
    expect(dataRange.getRange).toHaveBeenCalled();
  });

  it('insertTable retries with a unique name when the default is taken', async () => {
    const { api, sheet } = makeApi({ addTable: (name) => name === 'Tabelle 2' });
    const ok = await createSheetMenuActions(api).insertTable();
    expect(ok).toBe(true);
    expect(sheet.addTable).toHaveBeenCalledTimes(2);
    expect(sheet.addTable).toHaveBeenNthCalledWith(1, 'Tabelle', expect.anything());
    expect(sheet.addTable).toHaveBeenNthCalledWith(2, 'Tabelle 2', expect.anything());
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

  it('no-ops without throwing when there is no active workbook', async () => {
    const api = { getActiveWorkbook: () => null, executeCommand: vi.fn() } as unknown as FUniver;
    const actions = createSheetMenuActions(api);
    expect(() => {
      actions.toggleFilter();
      actions.sort(true);
    }).not.toThrow();
    await expect(actions.insertTable()).resolves.toBe(false);
  });
});
