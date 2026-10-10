import { postToNativeHost } from '@gruenerator/shared';
import { useCallback, useRef } from 'react';
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
 */
export function useHostAwareBack(
  fallbackPath: string,
  flushBeforeLeave?: () => Promise<void>
): () => void {
  const navigate = useNavigate();
  // The host pops a route on every `CLOSE`; a second tap during the flush
  // would pop the screen below the WebView too. Never reset — CLOSE ends the page.
  const leaving = useRef(false);
  return useCallback(() => {
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
}
