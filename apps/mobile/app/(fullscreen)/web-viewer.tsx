import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { secureStorage } from '../../services/storage';
import { colors, lightTheme, darkTheme } from '../../theme';

const WEB_BASE = 'https://gruenerator.eu';

export default function WebViewerScreen() {
  const { path, title } = useLocalSearchParams<{ path?: string; title?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [tokenReady, setTokenReady] = useState(false);

  useMemo(() => {
    void secureStorage.getToken().then((t) => {
      setAuthToken(t);
      setTokenReady(true);
    });
  }, []);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const normalizedPath = useMemo(() => {
    if (!path) return '/';
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith('//') || !decoded.startsWith('/')) return '/';
    return decoded;
  }, [path]);

  if (!path) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text }}>Kein Pfad angegeben.</Text>
      </View>
    );
  }

  const targetUrl = `${WEB_BASE}/api/auth/v2/web-handoff?redirect=${encodeURIComponent(normalizedPath)}`;
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <View
        style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: theme.border }]}
      >
        <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title || 'Web'}
        </Text>
        <View style={styles.closeButton} />
      </View>

      {!tokenReady ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary[600]} />
        </View>
      ) : (
        <>
          <WebView
            ref={webViewRef}
            source={{ uri: targetUrl, ...(headers ? { headers } : {}) }}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            style={styles.webview}
            allowsBackForwardNavigationGestures
            domStorageEnabled
            javaScriptEnabled
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
  title: { fontSize: 16, fontWeight: '600' },
  webview: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
