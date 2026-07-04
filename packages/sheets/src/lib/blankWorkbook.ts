import type { IWorkbookData } from '@univerjs/presets';

/**
 * Minimal blank workbook used to seed a brand-new (UI-created) sheet on first
 * open. It MUST contain at least one worksheet — Univer renders no grid for a
 * workbook with `sheetOrder: []` / `sheets: {}`, which made every new sheet
 * open as an empty, non-functional editor. Mirrors the server-seeded structure
 * in SheetGenerationService.buildWorkbookSnapshot.
 *
 * `id` is forced to the documentId so all clients share one unitId (mutation
 * params must match across peers).
 */
export function buildBlankWorkbook(documentId: string): Partial<IWorkbookData> {
  const sheetId = 'sheet-1';
  return {
    id: documentId,
    name: 'Tabelle',
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: 'Tabelle1',
        rowCount: 100,
        columnCount: 26,
        cellData: {},
      },
    },
  };
}
