import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import {
  handleRenderHostMessage,
  registerRenderHost,
  hostUnavailable,
  unregisterRenderHost,
  useRenderHostDemand,
} from '../../services/sharepicRender';
import { mintWebViewHandoff } from '../../services/webview/handoff';
import { decideNavigation } from '../../services/webview/navigationPolicy';

const WEB_BASE = 'https://gruenerator.eu';
const RENDER_PATH = '/mobile-render';

/**
 * The stage size the page renders into.
 *
 * NOT zero. An invisible WebView is tempting to collapse to 0×0, but the page
 * mounts a Konva stage sized against its viewport — at zero it produces an
 * empty picture rather than no picture, which is the failure that looks like
 * success. Opacity is what hides it; the layout box stays real.
 */
const STAGE_WIDTH = 1200;
const STAGE_HEIGHT = 1500;

/**
 * Hosts the hidden WebView that renders sharepics.
 *
 * Mounted once, near the root, and only while there is work — see
 * `useRenderHostDemand`. It has no UI: everything it does travels over
 * `postMessage`, and `services/sharepicRender.ts` holds the queue and the
 * protocol so the interesting parts are testable without a device.
 */
export function SharepicRenderHost() {
  const demanded = useRenderHostDemand();
  const webViewRef = useRef<WebView>(null);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  /** Bumped to re-mint the handoff after the session is lost. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!demanded) {
      setTargetUrl(null);
      return;
    }
    let cancelled = false;
    // `?embedded=1` puts the web app in its chrome-less mode. The render page
    // shows nothing anyway, but the switch also suppresses the login redirect
    // and the terms banner, which would otherwise occupy the WebView.
    // Spelled out rather than built from RENDER_PATH: the allowlist drift
    // guard in `apps/api/plugins/webViewHandoffRedirect.vitest.ts` reads these
    // call sites as source text, and cannot see through a template hole.
    void mintWebViewHandoff('/mobile-render?embedded=1')
      .then((url) => {
        if (!cancelled) setTargetUrl(url);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Nothing to show the user — the cards resolve to "keine Vorschau" on
        // their own once the pending renders are failed here.
        hostUnavailable(error instanceof Error ? error.message : 'handoff failed');
      });
    return () => {
      cancelled = true;
    };
  }, [demanded, attempt]);

  useEffect(() => {
    return () => unregisterRenderHost();
  }, []);

  const handleLoadEnd = useCallback(() => {
    // The page announces itself with RENDER_HOST_READY; registering the sender
    // here means the queue can start the moment that arrives.
    registerRenderHost((payload: string) => {
      webViewRef.current?.postMessage(payload);
    });
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const outcome = handleRenderHostMessage(event.nativeEvent.data);
    if (outcome === 'session-lost') {
      // Mint a fresh handoff and try again. The queued renders survive — the
      // service put the in-flight one back at the front.
      setTargetUrl(null);
      setAttempt((n) => n + 1);
    }
  }, []);

  // The page is a renderer, not a browser: nothing but itself and the API it
  // reads assets from may load.
  const handleShouldStartLoad = useCallback((request: { url: string; isTopFrame?: boolean }) => {
    return (
      decideNavigation(request, {
        origin: WEB_BASE,
        allowedPathPrefixes: [RENDER_PATH],
      }) === 'allow'
    );
  }, []);

  if (!demanded || targetUrl === null) return null;

  return (
    <View style={styles.stage} pointerEvents="none" accessibilityElementsHidden>
      <WebView
        ref={webViewRef}
        source={{ uri: targetUrl }}
        style={styles.webview}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        javaScriptEnabled
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onError={() => hostUnavailable('webview error')}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsLinkPreview={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'absolute',
    // Off-screen rather than merely transparent: a full-size transparent view
    // over the chat would still swallow the first touch on some Android builds.
    left: -STAGE_WIDTH - 100,
    top: 0,
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    opacity: 0,
  },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
