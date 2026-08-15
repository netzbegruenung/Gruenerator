import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Boards open in the embedded web board, not as a native read-only view.
 *
 * The native view reimplemented a slice of the web board — Kanban columns and
 * a flat list of whiteboard texts — from a `BoardState` snapshot. It could
 * only ever show that slice: the web board also has table, calendar, gantt and
 * Excalidraw views, card details, comments and live collaboration, and none of
 * that survives the snapshot. Read-only was not a design decision either, just
 * what the snapshot allowed.
 *
 * Kept as its own route so the existing callers
 * (`components/office/officeItem.ts`) keep working unchanged.
 */
export default function BoardViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/boards/${id}`, title: title ?? 'Board' },
      }}
    />
  );
}
