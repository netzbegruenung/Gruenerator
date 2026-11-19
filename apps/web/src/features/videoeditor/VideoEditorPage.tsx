import { useState } from 'react';

import { editorAppSrc, VIDEO_EDITOR_APP_PATH } from './editorAppSrc';
import VideoEditorBetaDialog from './VideoEditorBetaDialog';

/**
 * The full video editor, the second video path in the Studio next to Untertitel.
 * Open to everyone as a beta: the first visit shows VideoEditorBetaDialog.
 *
 * The editor is a separate application from a private repository (it is built on
 * proprietary code that must not enter this AGPL codebase). It is served
 * same-origin under VIDEO_EDITOR_APP_PATH — by nginx in production, by the Vite
 * dev proxy locally — so it shares the session cookie and calls /api directly.
 */
export { VIDEO_EDITOR_APP_PATH };

/** localStorage key (F0): set once the beta notice was closed. */
export const BETA_NOTICE_SEEN_KEY = 'videoeditor-beta-notice-seen';

function betaNoticeSeen(): boolean {
  try {
    return localStorage.getItem(BETA_NOTICE_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export default function VideoEditorPage() {
  // Read once: the frame keeps its document; changing src later would reload the editor.
  const [src] = useState(() => editorAppSrc(window.location.search));
  const [betaNoticeOpen, setBetaNoticeOpen] = useState(() => !betaNoticeSeen());

  const closeBetaNotice = (open: boolean) => {
    if (open) return;
    setBetaNoticeOpen(false);
    try {
      localStorage.setItem(BETA_NOTICE_SEEN_KEY, '1');
    } catch {
      // Private mode: the notice simply shows again next time.
    }
  };

  return (
    <>
      <iframe
        src={src}
        title="Grünerator Video-Editor"
        className="block h-dvh w-full border-0"
        allow="autoplay; fullscreen; clipboard-read; clipboard-write"
      />
      <VideoEditorBetaDialog open={betaNoticeOpen} onOpenChange={closeBetaNotice} />
    </>
  );
}
