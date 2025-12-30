import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { initializeApiClient } from '../../services/api';
import { handleAuthCallback, configureAuthStore } from '../../services/auth';
import { colors } from '../../theme';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code: string }>();

  useEffect(() => {
    async function processCallback() {
      if (code) {
        try {
          console.log('[AuthCallback] Processing code...');

          // Ensure API client is initialized (may be called before AuthProvider)
          initializeApiClient();
          configureAuthStore();

          const result = await handleAuthCallback(code);
          if (result.success) {
            console.log('[AuthCallback] Login successful, redirecting to tabs');
            router.replace('/(tabs)');
          } else {
            console.log('[AuthCallback] Login failed:', result.error);
            router.replace('/(auth)/login');
          }
        } catch (error) {
          console.error('[AuthCallback] Error:', error);
          router.replace('/(auth)/login');
        }
      } else {
        console.log('[AuthCallback] No code provided, redirecting to login');
        router.replace('/(auth)/login');
      }
    }
    processCallback();
  }, [code]);

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
