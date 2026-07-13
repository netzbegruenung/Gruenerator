import { type IWorkbookData } from '@gruenerator/sheets';

/**
 * Starter spreadsheets for the "Tabellen" section of the docs gallery — the
 * sheet analogue of `boardTemplates` / doc `templates`. Each `workbook` is a
 * minimal Univer snapshot (`Partial<IWorkbookData>`) seeded into a fresh sheet
 * doc's Y.Doc on first open (see `attachYjsBridge`'s `seedWorkbook` path).
 */
export interface SheetTemplate {
  id: string;
  name: string;
  description: string;
  defaultTitle: string;
  workbook: Partial<IWorkbookData>;
}

// Univer style id for the bold, tinted header row — referenced by cell `s`.
const HEADER_STYLE_ID = 'header';

type CellValue = string | number;

/**
 * Builds a minimal Univer workbook snapshot from a header row + body rows.
 *
 * Boundary cast: we author our own template DSL (header/rows) and hand Univer a
 * partial snapshot. Univer fills every unspecified worksheet default at
 * `createWorkbook` time (the blank-seed path already passes `sheets: {}`), so
 * only `id`/`name`/`cellData` plus a size hint are meaningful here. Typing the
 * partial worksheets against the full `IWorksheetData` shape would be a false
 * precision, so the whole literal is asserted as `Partial<IWorkbookData>` once.
 */
function buildWorkbook(
  sheetName: string,
  header: string[],
  rows: CellValue[][]
): Partial<IWorkbookData> {
  const cellData: Record<number, Record<number, { v: CellValue; s?: string }>> = {
    0: Object.fromEntries(header.map((label, col) => [col, { v: label, s: HEADER_STYLE_ID }])),
  };
  rows.forEach((row, r) => {
    cellData[r + 1] = Object.fromEntries(row.map((value, col) => [col, { v: value }]));
  });

  const sheetId = 'sheet-1';
  const columnCount = Math.max(12, header.length + 2);
  const rowCount = Math.max(50, rows.length + 20);

  return {
    name: sheetName,
    sheetOrder: [sheetId],
    styles: {
      // bl: bold (BooleanNumber.TRUE), bg: light green tint matching the design.
      [HEADER_STYLE_ID]: { bl: 1, bg: { rgb: '#E7F1EA' } },
    },
    sheets: {
      [sheetId]: { id: sheetId, name: sheetName, cellData, rowCount, columnCount },
    },
  } as Partial<IWorkbookData>;
}

export const sheetTemplates: SheetTemplate[] = [
  {
    id: 'sheet-mitglieder',
    name: 'Mitgliederliste',
    description: 'Kontakte & Status',
    defaultTitle: 'Mitgliederliste',
    workbook: buildWorkbook(
      'Mitglieder',
      ['Name', 'Rolle', 'Kontakt', 'Status'],
      [
        ['Maxi Mustermensch', 'Vorsitz', 'maxi@example.org', 'aktiv'],
        ['Robin Beispiel', 'Schriftführung', 'robin@example.org', 'aktiv'],
        ['Kim Vorlage', 'Kassier*in', 'kim@example.org', 'aktiv'],
        ['Alex Entwurf', 'Mitglied', 'alex@example.org', 'passiv'],
      ]
    ),
  },
  {
    id: 'sheet-haushalt',
    name: 'Haushaltsplan',
    description: 'Budget & Ausgaben',
    defaultTitle: 'Haushaltsplan',
    workbook: buildWorkbook(
      'Haushalt',
      ['Posten', 'Geplant (€)', 'Ausgegeben (€)', 'Rest (€)'],
      [
        ['Wahlkampfmaterial', 1200, 0, ''],
        ['Raummiete', 400, 0, ''],
        ['Verpflegung', 250, 0, ''],
        ['Öffentlichkeitsarbeit', 600, 0, ''],
      ]
    ),
  },
  {
    id: 'sheet-aufgaben',
    name: 'Aufgabenliste',
    description: 'Aufgaben & Fristen',
    defaultTitle: 'Aufgabenliste',
    workbook: buildWorkbook(
      'Aufgaben',
      ['Aufgabe', 'Verantwortlich', 'Frist', 'Status'],
      [
        ['Plakate bestellen', '', '', 'offen'],
        ['Infostand anmelden', '', '', 'offen'],
        ['Social-Media-Plan erstellen', '', '', 'offen'],
        ['Pressemitteilung versenden', '', '', 'offen'],
      ]
    ),
  },
];

export function getSheetTemplate(id: string): SheetTemplate | null {
  return sheetTemplates.find((t) => t.id === id) ?? null;
}
