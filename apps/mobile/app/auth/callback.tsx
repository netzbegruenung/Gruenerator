import { useAuthStore } from '@gruenerator/shared/stores';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

import { initializeApiClient } from '../../services/api';
import { handleAuthCallback, configureAuthStore } from '../../services/auth';
import { colors } from '../../theme';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    // Android delivers the OAuth callback URL to both the WebBrowser Custom
    // Tab (which resolves openAuthSessionAsync in services/auth.ts) AND the
    // Android Intent system (which mounts this screen). If the WebBrowser
    // path won the race and already set `user`, this mount is redundant —
    // navigate straight to tabs without re-processing the one-shot JWT.
    if (user) {
      router.replace('/(tabs)');
      return;
    }

    // iOS cold-start fallback: ASWebAuthenticationSession doesn't fire
    // Linking, and if the app was killed mid-flow we arrive here with a
    // fresh `code` and no live WebBrowser session to process it. Since
    // handleAuthCallback is idempotent by `code`, racing the WebBrowser
    // path (Android) is harmless — both callers await one HTTP exchange.
    async function processCallback() {
      if (code) {
        try {
          initializeApiClient();
          configureAuthStore();
          const result = await handleAuthCallback(code);
          router.replace(result.success ? '/(tabs)' : '/(auth)/login');
        } catch {
          router.replace('/(auth)/login');
        }
      } else {
        router.replace('/(auth)/login');
      }
    }
    void processCallback();
  }, [code, user]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.white} />
      <Text style={styles.text}>Anmeldung wird abgeschlossen...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary[900],
  },
  text: {
    color: colors.white,
    marginTop: 16,
    fontSize: 16,
  },
});
