/**
 * The full video editor, the second reel path in the Studio next to Simple Reel.
 *
 * The editor is a separate application from a private repository (it bundles a
 * proprietary SDK that must not enter this AGPL codebase). It is served
 * same-origin under VIDEO_EDITOR_APP_PATH — by nginx in production, by the Vite
 * dev proxy locally — so it shares the session cookie and calls /api directly.
 */
export const VIDEO_EDITOR_APP_PATH = '/videoeditor/app/';

export default function VideoEditorPage() {
  return (
    <iframe
      src={VIDEO_EDITOR_APP_PATH}
      title="Gruenerator Video Editor"
      className="block h-dvh w-full border-0"
      allow="autoplay; fullscreen; clipboard-read; clipboard-write"
    />
  );
}
