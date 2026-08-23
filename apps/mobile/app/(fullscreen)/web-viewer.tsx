import { parseWebViewMessage } from '@gruenerator/shared';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { mintWebViewHandoff } from '../../services/webview/handoff';
import {
  decideNavigation,
  WEBVIEW_ORIGIN_WHITELIST,
} from '../../services/webview/navigationPolicy';
import { colors, lightTheme, darkTheme, BODY_FONT } from '../../theme';

const WEB_BASE = 'https://gruenerator.eu';

export default function WebViewerScreen() {
  const { path, title } = useLocalSearchParams<{ path?: string; title?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Also what Android's hardware back does: nothing here intercepts it, so it
  // pops this route rather than walking the WebView's history. That is the
  // behaviour we want — the screen is pinned to one page, so "back" can only
  // mean "leave it" — and it is left unwired on purpose. A `BackHandler` that
  // forwarded to the WebView would have to know whether the embedded page has
  // a dialog open, which it cannot.
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const normalizedPath = useMemo(() => {
    if (!path) return '/';
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith('//') || !decoded.startsWith('/')) return '/';
    return decoded;
  }, [path]);

  // The page is opened with `?embedded=1`, which switches the web app to its
  // chrome-less mode (no sidebar, no banners, no login redirect). Without it
  // the WebView would show app navigation the user could tap into.
  const embeddedPath = useMemo(() => {
    const [pathname, query] = normalizedPath.split('?');
    const params = new URLSearchParams(query);
    params.set('embedded', '1');
    return `${pathname}?${params.toString()}`;
  }, [normalizedPath]);

  useEffect(() => {
    let cancelled = false;
    void mintWebViewHandoff(embeddedPath)
      .then((url) => {
        if (!cancelled) setTargetUrl(url);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.warn('[WebViewer] handoff failed', err);
        setError('Die Seite konnte nicht geöffnet werden. Bitte melde dich neu an.');
      });
    return () => {
      cancelled = true;
    };
  }, [embeddedPath]);

  // Only the page we opened may load. `originWhitelist` cannot do this job —
  // per react-native-webview's docs an origin outside the whitelist is handed
  // to the system browser, i.e. it escalates instead of blocking.
  const policy = useMemo(
    () => ({
      origin: WEB_BASE,
      allowedPathPrefixes: [normalizedPath.split('?')[0] ?? '/'],
    }),
    [normalizedPath]
  );

  const openExternally = useCallback((url: string) => {
    void WebBrowser.openBrowserAsync(url).catch((err: unknown) =>
      console.warn('[WebViewer] failed to open external URL', err)
    );
  }, []);

  const handleShouldStartLoad = useCallback(
    (request: { url: string; isTopFrame?: boolean }) => {
      const decision = decideNavigation(request, policy);
      if (decision === 'external') openExternally(request.url);
      return decision === 'allow';
    },
    [policy, openExternally]
  );

  // `target="_blank"` never becomes a navigation, so the gate above never sees
  // it — the editor's Unsplash attribution links arrive here instead.
  const handleOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl: string } }) => {
      const url = event.nativeEvent.targetUrl;
      if (decideNavigation({ url, isTopFrame: true }, policy) === 'external') {
        openExternally(url);
      }
    },
    [policy, openExternally]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseWebViewMessage(event.nativeEvent.data);
      if (message === null) return;
      // Both messages mean the same thing for the host: this screen is done.
      // SESSION_LOST additionally tells the user why, since the page cannot
      // show a login screen from inside a pinned WebView.
      if (message.type === 'SESSION_LOST') {
        setError('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.');
        return;
      }
      if (message.type === 'CLOSE') {
        handleClose();
      }
    },
    [handleClose]
  );

  if (!path) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Kein Pfad angegeben.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <View
        style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: theme.border }]}
      >
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title || 'Web'}
        </Text>
        <View style={styles.closeButton} />
      </View>

      {error !== null ? (
        <View style={styles.loading}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
        </View>
      ) : targetUrl === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary[600]} />
        </View>
      ) : (
        <>
          <WebView
            ref={webViewRef}
            source={{ uri: targetUrl }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            style={styles.webview}
            domStorageEnabled
            javaScriptEnabled
            onMessage={handleMessage}
            // — containment —
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onOpenWindow={handleOpenWindow}
            // Everything, on purpose — and the reason is written out at
            // WEBVIEW_ORIGIN_WHITELIST. Short version: a URL that fails this
            // list is handed to `Linking.openURL` and the gate above is never
            // asked. `${WEB_BASE}/*` matched nothing (the list is compared to
            // an origin, which has no trailing slash), so from 15.08.2026 every
            // navigation here left for the system browser.
            originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
            // Android defaults to true, which lets target="_blank" spawn a
            // second WebView we do not control.
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            // Edge-swipe would walk the web history back out of the page.
            allowsBackForwardNavigationGestures={false}
            // iOS long-press peek renders an arbitrary URL outside the gate.
            allowsLinkPreview={false}
            // Not set, deliberately: `mediaCapturePermissionGrantType` and
            // `allowsInlineMediaPlayback`. No embeddable surface calls
            // getUserMedia, uses `capture=` or renders a `<video>` — granting
            // camera access up front on a screen built for containment would
            // buy nothing. Revisit when a surface here needs either.
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            // The editors open their text inputs from code: the canvas editor
            // mounts a textarea over the shape and focuses it, the board does
            // the same for a new card and for comments. iOS defaults this to
            // `true`, which means a focus the user did not trigger by tapping
            // an input does NOT raise the keyboard — the caret blinks and
            // nothing can be typed. Everything this screen shows is an editor,
            // so the default is wrong here.
            keyboardDisplayRequiresUserAction={false}
          />
          {loading && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator color={colors.primary[600]} />
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: BODY_FONT, fontSize: 16, fontWeight: '600' },
  webview: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
});
