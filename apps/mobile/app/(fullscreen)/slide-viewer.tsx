import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Presentations open in the embedded web editor, not as a native slide deck.
 *
 * What stood here rendered a decoded snapshot read-only: swipe through the
 * slides, nothing else. No editing, no speaker notes, no presenting — and the
 * web editor next to it can do all of it. Reimplementing reveal.js natively is
 * not on the table.
 *
 * `/office/:id` is the dispatcher (`CollabDocRoute`) that picks the editor by
 * `document_subtype` — the same path serves text documents and sheets.
 *
 * Kept as its own route so the existing caller
 * (`components/office/officeItem.ts`) keeps working unchanged.
 */
export default function SlideViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/office/${id}`, title: title ?? 'Präsentation' },
      }}
    />
  );
}
