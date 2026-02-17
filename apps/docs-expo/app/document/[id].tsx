import { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@gruenerator/shared/stores';
import { secureStorage } from '../../services/storage';
import { lightTheme, darkTheme, colors } from '../../theme';
import { API_BASE_URL } from '../../config';
import { WebView } from 'react-native-webview';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.centerContainer}>
      <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
      <Text style={styles.errorTitle}>{error.message || 'Ein Fehler ist aufgetreten'}</Text>
      <TouchableOpacity
        style={[styles.backButton, { backgroundColor: colors.primary[600] }]}
        onPress={retry}
      >
        <Text style={styles.backButtonText}>Erneut versuchen</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const webViewRef = useRef<WebView>(null);

  const { user } = useAuthStore();

  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadToken = async () => {
      if (!id) {
        setError('Keine Dokument-ID angegeben');
        setIsLoading(false);
        return;
      }

      const authToken = await secureStorage.getToken();
      if (!authToken) {
        setError('Nicht angemeldet');
        setIsLoading(false);
        return;
      }
      setToken(authToken);
      setIsLoading(false);
    };

    loadToken();
  }, [id]);

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Dokument wird geladen...
        </Text>
      </View>
    );
  }

  if (error || !token || !user) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.error[500]} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>
          {error || 'Ein Fehler ist aufgetreten'}
        </Text>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: colors.primary[600] }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={20} color="white" />
          <Text style={styles.backButtonText}>Zurück</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const [bridgeUrl, setBridgeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;

    const fetchBridgeCode = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/mobile/session-bridge`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ redirect: `/document/${id}` }),
        });

        if (!response.ok) {
          setError('Sitzung abgelaufen — bitte erneut anmelden');
          return;
        }

        const { code } = await response.json();
        setBridgeUrl(`${API_BASE_URL}/auth/mobile/session-bridge?code=${encodeURIComponent(code)}`);
      } catch {
        setError('Verbindung fehlgeschlagen');
      }
    };

    fetchBridgeCode();
  }, [token, id]);

  if (!bridgeUrl) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Dokument wird geladen...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: bridgeUrl }}
        style={{ flex: 1 }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
          </View>
        )}
        onError={(e) => console.log('[WebView] error:', e.nativeEvent)}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode === 401) {
            setError('Sitzung abgelaufen — bitte erneut anmelden');
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backIcon: {
    padding: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
