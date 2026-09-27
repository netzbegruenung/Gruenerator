import { ensureFontsReady } from '@gruenerator/canvas-editor';
import {
  parseHostMessage,
  postToNativeHost,
  WEBVIEW_PROTOCOL_VERSION,
  type WebViewInboundMessage,
} from '@gruenerator/shared';
import { useEffect, useRef, useState } from 'react';

import { renderSharepicToImage } from '../features/image-studio/renderSharepicToImage';

/**
 * The sharepic renderer the mobile app cannot have.
 *
 * A sharepic is drawn by Konva in a DOM and there is no server-side renderer —
 * `thumbnail_url` is written by the web editor and nothing else. So the app
 * loads this page in a hidden WebView, posts the canvas description in, and
 * gets a PNG back. Same renderer as every web preview, which is the point:
 * a native re-implementation would drift the moment a template changes.
 *
 * The page draws nothing. It has no chrome, no route parameters and no state
 * a user could see; everything arrives over `postMessage`.
 */
export default function MobileRenderPage() {
  // Only for the human who opens this URL in a browser and wonders what broke.
  const [ready, setReady] = useState(false);
  /**
   * Renders run one at a time.
   *
   * Each `renderSharepicToImage` mounts its own React root with a full Konva
   * stage; several at once on a phone-class WebView is how you get an
   * out-of-memory kill instead of three pictures. The host serialises too, but
   * that is its own decision — this page does not rely on it.
   */
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;

    const run = async (request: WebViewInboundMessage): Promise<void> => {
      try {
        const image = await renderSharepicToImage(request.canvasType, request.initialProps);
        if (cancelled) return;
        if (image === null) {
          // `renderSharepicToImage` resolves null on its own 5s timeout — a
          // missing font, an image that never loaded, an unknown canvas type.
          // Reported as an error rather than an empty result so the host can
          // retry instead of caching a blank.
          postToNativeHost({
            type: 'RENDER_ERROR',
            requestId: request.requestId,
            reason: 'capture returned no image',
          });
          return;
        }
        postToNativeHost({ type: 'RENDER_RESULT', requestId: request.requestId, image });
      } catch (error: unknown) {
        if (cancelled) return;
        postToNativeHost({
          type: 'RENDER_ERROR',
          requestId: request.requestId,
          reason: error instanceof Error ? error.message : 'unknown render failure',
        });
      }
    };

    const handleMessage = (event: MessageEvent) => {
      const request = parseHostMessage(event.data);
      if (request === null) return;
      queue.current = queue.current.then(() => run(request));
    };

    // Both targets: react-native-webview delivers to `document` on Android and
    // to `window` on iOS. The shipped editor page listens on both for the same
    // reason.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage as EventListener);

    // Fonts first, and NOT because the capture would otherwise use the fallback
    // face — `captureCanvas` already awaits `ensureFontsReady` itself. What the
    // warm-up buys is the budget: that capture polls for at most five seconds
    // from mount, and on a cold WebView the brand faces can eat most of it.
    // Announcing late costs one wait; announcing early costs a blank render.
    void ensureFontsReady().then(() => {
      if (cancelled) return;
      setReady(true);
      postToNativeHost({
        type: 'RENDER_HOST_READY',
        protocolVersion: WEBVIEW_PROTOCOL_VERSION,
      });
    });

    return () => {
      cancelled = true;
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage as EventListener);
    };
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
        fontSize: 13,
        opacity: 0.5,
      }}
    >
      {ready ? 'Sharepic-Renderer bereit.' : 'Sharepic-Renderer startet …'}
    </div>
  );
}
