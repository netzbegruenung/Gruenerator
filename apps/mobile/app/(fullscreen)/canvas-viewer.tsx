import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Canvases open in the embedded web editor, not as a native preview.
 *
 * The native preview showed the server-stored `thumbnail_url`, which fails in
 * three independent ways: the column holds an origin-relative URL that resolves
 * to nothing on native, the image endpoint requires auth that `<Image>` cannot
 * send, and — the reason a fix was pointless — there is no server-side canvas
 * renderer at all, so a canvas that has never been opened in a browser has no
 * thumbnail to show. The WebView shows the real editor and, as a side effect,
 * writes the missing thumbnail.
 *
 * Kept as its own route so the existing callers (`components/office/officeItem.ts`,
 * `hooks/useRecentActivity.ts`) keep working unchanged.
 */
export default function CanvasViewerScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/studio/canvas/${id}`, title: title ?? 'Sharepic' },
      }}
    />
  );
}
