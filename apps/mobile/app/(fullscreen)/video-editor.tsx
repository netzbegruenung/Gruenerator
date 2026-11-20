import { Redirect } from 'expo-router';

/**
 * The Video-Editor opens in the embedded web page, the same one web shows: the
 * editor is a separate app from a private repository, embedded there in an
 * iframe. It exports in the WebView and hands the video over in pieces
 * (`HOST_CAPABILITY_FILE_TRANSFER`). Only offered where it can export, see
 * `isVideoEditorSupported`.
 */
export default function VideoEditorScreen() {
  return (
    <Redirect
      href={{
        pathname: '/(fullscreen)/web-viewer',
        params: { path: '/studio/videoeditor', title: 'Video-Editor' },
      }}
    />
  );
}
