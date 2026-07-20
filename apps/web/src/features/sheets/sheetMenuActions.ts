import { type FUniver } from '@gruenerator/sheets';

/**
 * Command ids for the panel/dialog actions that Univer only exposes via
 * operation commands (no Facade method). Verified against the installed
 * 0.25.1 plugin bundles. Single source of truth so the menu and its dispatch
 * test agree and any Univer-upgrade drift surfaces in one place.
 */
export const SHEET_MENU_COMMAND_IDS = {
  conditionalFormatting: 'sheet.operation.open.conditional.formatting.panel',
  dataValidation: 'data-validation.operation.open-validation-panel',
  findReplace: 'ui.operation.open-find-dialog',
  zen: 'zen-editor.command.open-zen-editor',
  crosshair: 'sheet.operation.toggle-crosshair-highlight',
} as const;

// Univer requires table names to be unique across tables, sheet names, and
// defined names. There is no facade to list existing tables, so try a counter
// suffix until one is accepted (or give up after a sane bound).
const MAX_TABLE_NAME_ATTEMPTS = 20;

type FSheet = NonNullable<
  ReturnType<NonNullable<ReturnType<FUniver['getActiveWorkbook']>>['getActiveSheet']>
>;
type FRangeLike = NonNullable<ReturnType<FSheet['getActiveRange']>>;

/**
 * A cursor on a single cell is not a meaningful filter/table target — expand to
 * the sheet's contiguous data region, matching typical spreadsheet UX.
 */
function effectiveRange(sheet: FSheet, range: FRangeLike): FRangeLike {
  if (range.getWidth() <= 1 && range.getHeight() <= 1) return sheet.getDataRange();
  return range;
}

/**
 * Pure action handlers for the sheet Format menu, split from the React
 * component so their Facade calls / command dispatch are unit-testable in a
 * node env. Every handler no-ops safely when there is no active workbook/range.
 */
export function createSheetMenuActions(univerAPI: FUniver) {
  const activeSheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet() ?? null;
  const activeRange = () => activeSheet()?.getActiveRange() ?? null;
  const run = (id: string) => void univerAPI.executeCommand(id);

  return {
    toggleFilter() {
      const sheet = activeSheet();
      if (!sheet) return;
      const existing = sheet.getFilter();
      if (existing) {
        existing.remove();
        return;
      }
      const range = activeRange();
      if (!range) return;
      effectiveRange(sheet, range).createFilter();
    },
    sort(asc: boolean) {
      const sheet = activeSheet();
      const range = activeRange();
      if (!sheet || !range) return;
      sheet.sort(range.getColumn(), asc);
    },
    /** @returns true if a table was inserted, false if it could not be. */
    async insertTable(): Promise<boolean> {
      const sheet = activeSheet();
      const selected = activeRange();
      if (!sheet || !selected) return false;
      const { startRow, startColumn, endRow, endColumn } = effectiveRange(
        sheet,
        selected
      ).getRange();
      const rangeInfo = { startRow, startColumn, endRow, endColumn };
      for (let i = 1; i <= MAX_TABLE_NAME_ATTEMPTS; i++) {
        const name = i === 1 ? 'Tabelle' : `Tabelle ${i}`;
        if (await sheet.addTable(name, rangeInfo)) return true;
      }
      return false;
    },
    openDataValidation: () => run(SHEET_MENU_COMMAND_IDS.dataValidation),
    openConditionalFormatting: () => run(SHEET_MENU_COMMAND_IDS.conditionalFormatting),
    openFindReplace: () => run(SHEET_MENU_COMMAND_IDS.findReplace),
    openZen: () => run(SHEET_MENU_COMMAND_IDS.zen),
    toggleCrosshair: () => run(SHEET_MENU_COMMAND_IDS.crosshair),
  };
}
