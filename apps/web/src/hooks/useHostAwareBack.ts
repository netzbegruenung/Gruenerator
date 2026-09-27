import { postToNativeHost } from '@gruenerator/shared';
import { useCallback } from 'react';
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
export function useHostAwareBack(fallbackPath: string): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    if (isEmbedded()) {
      postToNativeHost({ type: 'CLOSE' });
      return;
    }
    void navigate(fallbackPath);
  }, [navigate, fallbackPath]);
}
