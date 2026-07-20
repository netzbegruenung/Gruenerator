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
      } else {
        activeRange()?.createFilter();
      }
    },
    sort(asc: boolean) {
      const sheet = activeSheet();
      const range = activeRange();
      if (!sheet || !range) return;
      sheet.sort(range.getColumn(), asc);
    },
    insertTable() {
      const sheet = activeSheet();
      const range = activeRange();
      if (!sheet || !range) return;
      const { startRow, startColumn, endRow, endColumn } = range.getRange();
      void sheet.addTable('Tabelle', { startRow, startColumn, endRow, endColumn });
    },
    openDataValidation: () => run(SHEET_MENU_COMMAND_IDS.dataValidation),
    openConditionalFormatting: () => run(SHEET_MENU_COMMAND_IDS.conditionalFormatting),
    openFindReplace: () => run(SHEET_MENU_COMMAND_IDS.findReplace),
    openZen: () => run(SHEET_MENU_COMMAND_IDS.zen),
    toggleCrosshair: () => run(SHEET_MENU_COMMAND_IDS.crosshair),
  };
}
