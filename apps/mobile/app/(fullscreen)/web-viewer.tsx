import {
  HOST_CAPABILITY_EDITOR_CHROME,
  HOST_CAPABILITY_REQUEST_CLOSE,
  HOST_CAPABILITY_SHARE,
  hostCapabilitiesScript,
  parseWebViewMessage,
  type EditorCommand,
  type WebViewInboundMessage,
} from '@gruenerator/shared';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  Alert,
  BackHandler,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { RenameSheet } from '../../components/common/RenameSheet';
import { WebViewSkeleton } from '../../components/webview/WebViewSkeleton';
import { WEB_ORIGIN } from '../../services/webOrigin';
import { createCloseRequest } from '../../services/webview/closeRequest';
import { mintWebViewHandoff } from '../../services/webview/handoff';
import {
  embeddedSurfaceShape,
  hostDrawsEditorBar,
  hostDrawsHeader,
} from '../../services/webview/hostChrome';
import {
  decideNavigation,
  WEBVIEW_ORIGIN_WHITELIST,
} from '../../services/webview/navigationPolicy';
import { receiveDownload } from '../../services/webview/receiveDownload';
import { receiveShare } from '../../services/webview/receiveShare';
import { createRestartBudget } from '../../services/webview/restartBudget';
import { createSerialQueue } from '../../services/webview/serialQueue';
import { colors, lightTheme, darkTheme, BODY_FONT } from '../../theme';

// Android's System WebView has no `navigator.share`; this tells the page it can
// ask us instead (see `HOST_CAPABILITIES_GLOBAL`). `REQUEST_CLOSE` serves
// Android's hardware back and, on both platforms, the native editor bar's close
// button, which must let the page flush first just the same.
const HOST_CAPABILITIES_SCRIPT = hostCapabilitiesScript([
  HOST_CAPABILITY_SHARE,
  HOST_CAPABILITY_REQUEST_CLOSE,
  HOST_CAPABILITY_EDITOR_CHROME,
]);

/** What the editor bar's items take beside the title: close on the left, three actions on the right. */
const TITLE_RESERVED_WIDTH = 240;

/** How long hardware back waits for the page's `CLOSE`; its own flush bounds itself at 1 s. */
const REQUEST_CLOSE_TIMEOUT_MS = 1500;

/** What the page last reported for the native editor bar; see `EDITOR_STATE`. */
type EditorBarState = Omit<
  Extract<ReturnType<typeof parseWebViewMessage>, { type: 'EDITOR_STATE' }>,
  'type'
>;

/** One icon button in the native header: no label, no padding beyond the touch target. */
function HeaderIcon({
  icon,
  label,
  onPress,
  disabled = false,
  color,
}: {
  icon: 'close' | 'arrow-undo-outline' | 'arrow-redo-outline' | 'share-social-outline';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.headerIcon,
        disabled && styles.headerIconDisabled,
        pressed && styles.headerIconPressed,
      ]}
    >
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

export default function WebViewerScreen() {
  const { path, title } = useLocalSearchParams<{ path?: string; title?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The page's present mode is open; see `PRESENTING` in the bridge.
  const [presenting, setPresenting] = useState(false);
  const [editorBar, setEditorBar] = useState<EditorBarState | null>(null);
  const [renaming, setRenaming] = useState(false);
  /** Bumped to remount the WebView on a fresh handoff after its web process died. */
  const [attempt, setAttempt] = useState(0);
  const [restartBudget] = useState(() => createRestartBudget(3, 60_000));
  const [shareQueue] = useState(() =>
    createSerialQueue((err: unknown) => {
      console.warn('[WebViewer] share failed', err);
      Alert.alert('Fehler', 'Die Datei konnte nicht geteilt werden.');
    })
  );

  useEffect(() => shareQueue.cancel, [shareQueue]);

  // Android's hardware back pops this route rather than walking the WebView's
  // history: the screen is pinned to one page, so "back" can only mean "leave
  // it". The one exception is a page with state to flush (`CLOSE_HANDLER`): it
  // is asked first, see `createCloseRequest`.
  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const [closeRequest] = useState(() =>
    createCloseRequest({ close: () => router.back(), timeoutMs: REQUEST_CLOSE_TIMEOUT_MS })
  );

  useEffect(
    () =>
      closeRequest.attach(() =>
        webViewRef.current?.postMessage(JSON.stringify({ type: 'REQUEST_CLOSE' }))
      ),
    [closeRequest]
  );

  useEffect(() => closeRequest.dispose, [closeRequest]);

  useFocusEffect(
    useCallback(() => {
      // The error view has replaced the page; nobody is left to answer.
      const onBackPress = () => error === null && closeRequest.onHardwareBack();
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [error, closeRequest])
  );

  // The app is portrait-only on phones, which letterboxes a 16:9 deck to a
  // quarter of the screen. While presenting, any orientation goes; afterwards
  // (and when the screen closes mid-presentation) back to portrait. Not on an
  // iPad: it rotates freely already, and locking it to portrait on the way out
  // would take that away.
  useEffect(() => {
    if (!presenting || (Platform.OS === 'ios' && Platform.isPad)) return;
    void ScreenOrientation.unlockAsync().catch((err: unknown) =>
      console.warn('[WebViewer] orientation unlock failed', err)
    );
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        (err: unknown) => console.warn('[WebViewer] orientation lock failed', err)
      );
    };
  }, [presenting]);

  // Evaluated on the raw param rather than `normalizedPath`, so that a path we
  // would refuse to open anyway cannot silently claim the immersive layout.
  //
  // The error view is the exception: it replaces the page, so the page's own
  // back button goes with it. Only the dismiss gesture would be left, and an
  // expired session is the worst moment to make someone guess at one.
  const drawHeader = error !== null || hostDrawsHeader(path ?? '');
  const drawEditorBar = error === null && hostDrawsEditorBar(path ?? '');

  const sendToPage = useCallback((message: WebViewInboundMessage) => {
    webViewRef.current?.postMessage(JSON.stringify(message));
  }, []);
  const sendCommand = useCallback(
    (command: EditorCommand) => sendToPage({ type: 'EDITOR_COMMAND', command }),
    [sendToPage]
  );

  // The bar's close button leaves the way hardware back does: through the
  // page's flush when it announced one, at once otherwise.
  const closeEditor = useCallback(() => {
    if (!closeRequest.onHardwareBack()) closeRequest.onPageClose();
  }, [closeRequest]);

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
    // `fresh=1` previews a just-minted canvas once; the page drops it after the
    // first sync. A remount after a crash reloads an edited canvas, where that
    // preview would briefly show the stale initial state.
    if (attempt > 0) params.delete('fresh');
    return `${pathname}?${params.toString()}`;
  }, [normalizedPath, attempt]);

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
  }, [embeddedPath, attempt]);

  // Only the page we opened may load. `originWhitelist` cannot do this job —
  // per react-native-webview's docs an origin outside the whitelist is handed
  // to the system browser, i.e. it escalates instead of blocking.
  const policy = useMemo(
    () => ({
      origin: WEB_ORIGIN,
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

  // A WebView whose process is gone must not be reused (Android may crash), and
  // the handoff URL it was opened with is single-use, so remount on a fresh one.
  const handleProcessGone = useCallback(() => {
    if (!restartBudget()) {
      setError('Die Seite konnte nicht geöffnet werden. Bitte versuche es später erneut.');
      return;
    }
    setTargetUrl(null);
    setLoading(true);
    setPresenting(false);
    setEditorBar(null);
    closeRequest.setPageHandles(false);
    setAttempt((n) => n + 1);
  }, [restartBudget, closeRequest]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseWebViewMessage(event.nativeEvent.data);
      if (message === null) return;
      // CLOSE and SESSION_LOST both mean the same thing for the host: this
      // screen is done. SESSION_LOST additionally tells the user why, since the
      // page cannot show a login screen from inside a pinned WebView.
      if (message.type === 'SESSION_LOST') {
        setError('Deine Sitzung ist abgelaufen. Bitte melde dich neu an.');
        return;
      }
      if (message.type === 'CLOSE') {
        closeRequest.onPageClose();
        return;
      }
      if (message.type === 'CLOSE_HANDLER') {
        closeRequest.setPageHandles(message.active);
        return;
      }
      if (message.type === 'PRESENTING') {
        setPresenting(message.active);
        return;
      }
      if (message.type === 'EDITOR_STATE') {
        setEditorBar({
          title: message.title,
          canEdit: message.canEdit,
          canUndo: message.canUndo,
          canRedo: message.canRedo,
        });
        return;
      }
      if (message.type === 'DOWNLOAD_FILE') {
        // Deliberately NOT setError: that swaps the WebView for the error view
        // and takes unsaved editor state with it. A failed download is worth an
        // alert, not the loss of the document.
        void receiveDownload(message).catch((err: unknown) => {
          console.warn('[WebViewer] download failed', err);
          Alert.alert('Fehler', 'Die Datei konnte nicht gespeichert werden.');
        });
        return;
      }
      if (message.type === 'SHARE_FILE') {
        void shareQueue.enqueue(() => receiveShare(message));
      }
    },
    [closeRequest, shareQueue]
  );

  if (!path) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Kein Pfad angegeben.</Text>
      </View>
    );
  }

  // Both waits below show the same thing: the mint of the handoff URL, and the
  // page load that follows it. The surfaces that draw their own header get a
  // skeleton of that header and their body — until the page paints, the host is
  // showing nothing else. The rest are a different page every time and keep the
  // spinner; see `embeddedSurfaceShape`.
  const shape = embeddedSurfaceShape(path);
  const placeholder = shape ? (
    <WebViewSkeleton shape={shape} />
  ) : (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary[600]} />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* The `(fullscreen)` group hides the status bar for its read-only
          viewers. An editor is not one: it is worked in for minutes, and on a
          device with a cutout its band is reserved whether or not the clock is
          in it. `hidden` is always passed because expo-status-bar merges
          props down the tree and would otherwise keep the group's `hidden`.
          Present mode is the exception: the deck takes the whole screen. */}
      <StatusBar hidden={presenting} style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* Set on every render, not only for the editor: screen options outlive
          the element that set them, and the error view brings its own header. */}
      <Stack.Screen
        options={
          drawEditorBar
            ? {
                // Native, compact and in system colours: no large title, no
                // back label, icons only. Until the page reports its state the
                // title is the one the caller passed and the editing buttons wait.
                headerShown: !presenting,
                title: editorBar?.title || title || 'Sharepic',
                headerBackVisible: false,
                headerTitle: ({ children }) => (
                  <Pressable
                    onPress={() => setRenaming(true)}
                    disabled={!editorBar?.canEdit}
                    accessibilityRole="button"
                    accessibilityLabel={`Titel ändern: ${children}`}
                    accessibilityState={{ disabled: !editorBar?.canEdit }}
                    // Without a cap the title runs under the right-hand items.
                    style={{ maxWidth: windowWidth - TITLE_RESERVED_WIDTH }}
                  >
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                      {children}
                    </Text>
                  </Pressable>
                ),
                // iOS gets real bar button items with SF Symbols (below); the
                // Android toolbar takes image icons only, so it keeps views.
                ...(process.env.EXPO_OS === 'android' && {
                  headerLeft: () => (
                    <HeaderIcon
                      icon="close"
                      label="Schließen"
                      onPress={closeEditor}
                      color={theme.text}
                    />
                  ),
                  headerRight: () => (
                    <View style={styles.headerActions}>
                      {editorBar?.canEdit !== false && (
                        <>
                          <HeaderIcon
                            icon="arrow-undo-outline"
                            label="Rückgängig"
                            onPress={() => sendCommand('undo')}
                            disabled={!editorBar?.canUndo}
                            color={theme.text}
                          />
                          <HeaderIcon
                            icon="arrow-redo-outline"
                            label="Wiederholen"
                            onPress={() => sendCommand('redo')}
                            disabled={!editorBar?.canRedo}
                            color={theme.text}
                          />
                        </>
                      )}
                      <HeaderIcon
                        icon="share-social-outline"
                        label="Teilen und herunterladen"
                        onPress={() => sendCommand('share')}
                        disabled={editorBar === null}
                        color={theme.text}
                      />
                    </View>
                  ),
                }),
              }
            : { headerShown: false }
        }
      />
      {drawEditorBar && !presenting && process.env.EXPO_OS === 'ios' && (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="xmark"
              accessibilityLabel="Schließen"
              onPress={closeEditor}
            />
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="arrow.uturn.backward"
              accessibilityLabel="Rückgängig"
              onPress={() => sendCommand('undo')}
              disabled={!editorBar?.canUndo}
              hidden={editorBar?.canEdit === false}
            />
            <Stack.Toolbar.Button
              icon="arrow.uturn.forward"
              accessibilityLabel="Wiederholen"
              onPress={() => sendCommand('redo')}
              disabled={!editorBar?.canRedo}
              hidden={editorBar?.canEdit === false}
            />
            <Stack.Toolbar.Spacer width={8} />
            <Stack.Toolbar.Button
              icon="square.and.arrow.up"
              accessibilityLabel="Teilen und herunterladen"
              onPress={() => sendCommand('share')}
              disabled={editorBar === null}
            />
          </Stack.Toolbar>
        </>
      )}
      {drawEditorBar ? null : drawHeader ? (
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
      ) : (
        // Only the status-bar band. The page draws the bar itself and carries
        // both the title and the way out; see `hostDrawsHeader`. `insets.top`
        // is the honest number on every device: the status bar where there is
        // no cutout, the cutout where it is taller (34.33 dp on a Galaxy S24).
        <View style={{ height: presenting ? 0 : insets.top, backgroundColor: theme.background }} />
      )}

      {error !== null ? (
        <View style={styles.loading}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
        </View>
      ) : targetUrl === null ? (
        placeholder
      ) : (
        // The overlay is positioned against this box, not the screen, so the
        // skeleton starts below the status-bar band like the page will.
        <View style={styles.webview}>
          <WebView
            key={attempt}
            ref={webViewRef}
            source={{ uri: targetUrl }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadStart={() => {
              setLoading(true);
              // A reload unmounts present mode, the close handler and the
              // editor bar's state without any of them saying so.
              setPresenting(false);
              setEditorBar(null);
              closeRequest.setPageHandles(false);
            }}
            onLoadEnd={() => setLoading(false)}
            // The OS killed the page's web process (memory pressure); without
            // a reload the view stays blank and unresponsive.
            onContentProcessDidTerminate={handleProcessGone}
            onRenderProcessGone={handleProcessGone}
            style={styles.webview}
            domStorageEnabled
            javaScriptEnabled
            onMessage={handleMessage}
            injectedJavaScriptBeforeContentLoaded={HOST_CAPABILITIES_SCRIPT}
            // — containment —
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onOpenWindow={handleOpenWindow}
            // Everything, on purpose — and the reason is written out at
            // WEBVIEW_ORIGIN_WHITELIST. Short version: a URL that fails this
            // list is handed to `Linking.openURL` and the gate above is never
            // asked. `${WEB_ORIGIN}/*` matched nothing (the list is compared to
            // an origin, which has no trailing slash), so from 15.08.2026 every
            // navigation here left for the system browser.
            originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
            // Android defaults to true, which lets target="_blank" spawn a
            // second WebView we do not control.
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically={false}
            // Edge-swipe would walk the web history back out of the page.
            // The editors are app screens, not documents: the page must not
            // rubber-band when a drag reaches its edge.
            bounces={false}
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
              {placeholder}
            </View>
          )}
        </View>
      )}
      <RenameSheet
        title={renaming && editorBar ? editorBar.title : null}
        onSave={(next) => sendToPage({ type: 'EDITOR_RENAME', title: next })}
        onClose={() => setRenaming(false)}
      />
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
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerIconDisabled: { opacity: 0.3 },
  headerIconPressed: { opacity: 0.5 },
  webview: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
  },
  // No centring here any more: the placeholder inside brings its own layout —
  // `styles.loading` centres the spinner, the skeleton fills the box.
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
