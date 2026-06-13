import { useRef, useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useTheme } from '../../hooks/useTheme';
import { secureStorage } from '../../services/storage';
import { colors } from '../../theme';

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
  const theme = useTheme();
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
        }
      } catch (err) {
        console.warn('[WebViewEditor] Failed to parse message', err);
      }
    },
    [initialData, authToken, onSave, onCancel]
  );

  // Inject token into localStorage before page loads
  const injectedJavaScript = `
    (function() {
      try {
        if ('${authToken}') {
          window.localStorage.setItem('auth_token', '${authToken}');
        }
        // Signal that native environment is present
        window.isNativeApp = true;
      } catch (e) {
        // Ignore errors
      }
    })();
    true;
  `;

  if (!authToken && __DEV__ === false) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.textGreen} />
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
          <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
            <ActivityIndicator size="large" color={theme.textGreen} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Lade Editor...</Text>
          </View>
        )}
        // Optimization flags
        decelerationRate="normal"
        allowsInlineMediaPlayback={true}
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
  loadingContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
});
