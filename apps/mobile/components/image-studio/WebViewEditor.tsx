import { parseWebViewMessage } from '@gruenerator/shared';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';


import { secureStorage } from '../../services/storage';
import {
  decideNavigation,
  WEBVIEW_ORIGIN_WHITELIST,
} from '../../services/webview/navigationPolicy';
import { receiveDownload } from '../../services/webview/receiveDownload';
import { colors } from '../../theme';
import { WebViewSkeleton } from '../webview/WebViewSkeleton';

// Determine the web editor URL based on environment
// In dev: Use local IP for Android, localhost for iOS
const WEB_EDITOR_PATH = '/mobile-editor';
const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const PROD_URL = 'https://gruenerator.eu';

// You can override this via .env in a real app
const WEB_APP_URL = __DEV__
  ? `http://${DEV_HOST}:5173${WEB_EDITOR_PATH}`
  : `${PROD_URL}${WEB_EDITOR_PATH}`;

interface WebViewEditorProps {
  initialData: Record<string, unknown>;
  onSave: (base64: string) => void;
  onCancel: () => void;
}

export function WebViewEditor({ initialData, onSave, onCancel }: WebViewEditorProps) {
  const webViewRef = useRef<WebView>(null);
  const insets = useSafeAreaInsets();
  const [_isReady, setIsReady] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Load auth token on mount
  useEffect(() => {
    void secureStorage.getToken().then(setAuthToken);
  }, []);

  // Send initialization data when the web app reports it is ready
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type: string;
          payload?: { image?: string };
        };

        switch (data.type) {
          case 'EDITOR_READY':
            setIsReady(true);
            webViewRef.current?.postMessage(
              JSON.stringify({
                type: 'INIT_DATA',
                payload: {
                  ...initialData,
                  authToken,
                },
              })
            );
            break;

          case 'SAVE_IMAGE':
            if (data.payload?.image) {
              onSave(data.payload.image);
            }
            break;

          case 'CANCEL':
            onCancel();
            break;

          case 'LOG':
            break;

          // The canvas editor's own download button, which this screen also
          // hosts. Routed through the shared parser rather than this file's
          // hand-rolled shape check — the payload carries a filename that
          // becomes a path, so it gets the real validation.
          case 'DOWNLOAD_FILE': {
            const message = parseWebViewMessage(event.nativeEvent.data);
            if (message?.type === 'DOWNLOAD_FILE') {
              void receiveDownload(message).catch((err: unknown) => {
                console.warn('[WebViewEditor] download failed', err);
                Alert.alert('Fehler', 'Die Datei konnte nicht gespeichert werden.');
              });
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.warn('[WebViewEditor] Failed to parse message', err);
      }
    },
    [initialData, authToken, onSave, onCancel]
  );

  // The same containment the pinned `web-viewer` screen has. This screen is the
  // app's second WebView and had none of it: any link the editor rendered would
  // have navigated this view somewhere else, with no chrome and no way back.
  // See `navigationPolicy.ts` for why the gate — and not `originWhitelist` —
  // is what actually holds.
  const policy = useMemo(
    () => ({
      origin: new URL(WEB_APP_URL).origin,
      allowedPathPrefixes: [WEB_EDITOR_PATH],
    }),
    []
  );

  const openExternally = useCallback((url: string) => {
    void WebBrowser.openBrowserAsync(url).catch((err: unknown) =>
      console.warn('[WebViewEditor] failed to open external URL', err)
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

  const handleOpenWindow = useCallback(
    (event: { nativeEvent: { targetUrl: string } }) => {
      const url = event.nativeEvent.targetUrl;
      if (decideNavigation({ url, isTopFrame: true }, policy) === 'external') {
        openExternally(url);
      }
    },
    [policy, openExternally]
  );

  // Inject token into localStorage before page loads.
  //
  // `JSON.stringify` rather than quoting it by hand: the token is an opaque
  // string from the server, and building JavaScript source out of it with bare
  // quotes means one apostrophe would end the string and run the rest as code.
  const injectedJavaScript = `
    (function() {
      try {
        var token = ${JSON.stringify(authToken ?? '')};
        if (token) {
          window.localStorage.setItem('auth_token', token);
        }
        // Signal that native environment is present
        window.isNativeApp = true;
      } catch (e) {
        // Ignore errors
      }
    })();
    true;
  `;

  // Both waits are the same surface: `/mobile-editor` renders `MasterCanvasEditor`,
  // the very editor `/studio/canvas/` shows, so it gets that skeleton — a menu
  // bar, the stage, the tool row.
  if (!authToken && __DEV__ === false) {
    return (
      <View style={styles.loadingContainer}>
        <WebViewSkeleton shape="canvas" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.black }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_APP_URL }}
        style={[styles.webview, { marginTop: insets.top }]}
        onMessage={handleMessage}
        injectedJavaScriptBeforeContentLoaded={injectedJavaScript}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <WebViewSkeleton shape="canvas" />
          </View>
        )}
        // — containment, the same set as `web-viewer.tsx` —
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onOpenWindow={handleOpenWindow}
        // Everything, on purpose: a URL that fails this list is handed to
        // `Linking.openURL` and the gate above is never asked. The reasoning
        // is written out at `WEBVIEW_ORIGIN_WHITELIST`.
        originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        // Optimization flags
        decelerationRate="normal"
        allowsInlineMediaPlayback={true}
        // The canvas editor focuses its text inputs from code (it mounts a
        // textarea over the shape). iOS defaults this to `true`, which
        // suppresses the keyboard for exactly that case — see web-viewer.tsx.
        keyboardDisplayRequiresUserAction={false}
        scrollEnabled={false} // Canvas usually handles its own scrolling/panning
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  // The skeleton inside fills the box and paints its own background; nothing
  // left to centre.
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
});
