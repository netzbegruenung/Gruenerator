import {
  HOST_CAPABILITY_REQUEST_CLOSE,
  hostSupports,
  parseHostMessage,
  postToNativeHost,
} from '@gruenerator/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { isEmbedded } from '../utils/platform';

/**
 * The "back" affordance of a page that can be embedded in the mobile app's
 * WebView.
 *
 * Embedded, the WebView is pinned to a single screen: navigating to an
 * overview would drop the user into app chrome with no way out (the host
 * renders its own header, and the web chrome is switched off — see
 * `isEmbedded()`). So the page asks the host to close instead.
 *
 * Shared rather than repeated per editor: every surface reachable through
 * `EMBEDDABLE_PATH_PREFIXES` (`apps/api/plugins/webViewHandoffRedirect.ts`)
 * needs exactly this behaviour, and a page that forgets it is an escape hatch
 * out of the WebView.
 *
 * Android's hardware back is the host's, not the page's: with a flush to run,
 * the page announces `CLOSE_HANDLER` so the host sends `REQUEST_CLOSE` instead
 * of popping, and answers it through this same path (#4403).
 */
export function useHostAwareBack(
  fallbackPath: string,
  flushBeforeLeave?: () => Promise<void>
): () => void {
  const navigate = useNavigate();
  // The host pops a route on every `CLOSE`; a second tap during the flush
  // would pop the screen below the WebView too. Never reset — CLOSE ends the page.
  const leaving = useRef(false);
  const back = useCallback(() => {
    if (isEmbedded()) {
      if (leaving.current) return;
      leaving.current = true;
    }
    // Called in both modes: its synchronous part (committing an open edit)
    // runs before either exit. Only the WebView waits for the rest, because
    // `CLOSE` destroys it; the flush must bound itself.
    const flushed = (flushBeforeLeave?.() ?? Promise.resolve()).catch((error: unknown) =>
      console.error('[useHostAwareBack] flush before leaving failed', error)
    );
    if (isEmbedded()) {
      void flushed.then(() => postToNativeHost({ type: 'CLOSE' }));
      return;
    }
    void navigate(fallbackPath);
  }, [navigate, fallbackPath, flushBeforeLeave]);

  const hasFlush = flushBeforeLeave !== undefined;
  useEffect(() => {
    if (!hasFlush || !isEmbedded() || !hostSupports(HOST_CAPABILITY_REQUEST_CLOSE)) return;
    const handleMessage = (event: MessageEvent) => {
      if (parseHostMessage(event.data)?.type === 'REQUEST_CLOSE') back();
    };
    // react-native-webview delivers to `document` on Android, `window` on iOS.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage as EventListener);
    postToNativeHost({ type: 'CLOSE_HANDLER', active: true });
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage as EventListener);
      postToNativeHost({ type: 'CLOSE_HANDLER', active: false });
    };
  }, [hasFlush, back]);

  return back;
}
