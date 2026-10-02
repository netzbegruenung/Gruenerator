import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Text documents open in the embedded web editor (BlockNote), like sheets,
 * presentations, boards and canvas.
 *
 * They used to run as an Expo DOM component with a native shell around it:
 * native toolbars and sheets, a command bus into the DOM, and native proxies
 * for HTTP (CORS) and the Hocuspocus WebSocket. AI editing and comments were
 * switched off there, and image upload never existed. The web editor has all
 * of it and, since BlockNote 0.55, a formatting toolbar that sits on the
 * on-screen keyboard.
 *
 * Kept as its own route so the existing callers (document list, chat cards,
 * action URLs, recent activity) keep working unchanged.
 */
export default function DocEditorScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();

  return (
    <Redirect
      href={{
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/office/${id}`, title: title ?? 'Dokument' },
      }}
    />
  );
}
