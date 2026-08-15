import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Sheets open in the embedded web editor (Univer), not as a native grid.
 *
 * The native grid rendered a decoded workbook snapshot read-only: values only,
 * no formulas, no formatting, no second sheet, no editing. A spreadsheet whose
 * cells cannot be changed is of limited use, and reimplementing Univer natively
 * is not on the table.
 *
 * `/office/:id` is the dispatcher (`CollabDocRoute`) that picks the editor by
 * `document_subtype` — the same path serves text documents and presentations.
 *
 * Kept as its own route so the existing callers
 * (`components/office/officeItem.ts`) keep working unchanged.
 */
export default function SheetViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/office/${id}`, title: title ?? 'Tabelle' },
      }}
    />
  );
}
