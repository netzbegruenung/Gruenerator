import { useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { handleAuthCallback } from '../../services/auth';
import { colors } from '../../theme';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    async function processCallback() {
      if (code) {
        try {
          const result = await handleAuthCallback(code);
          if (result.success) {
            router.replace('/');
          } else {
            router.replace('/(auth)/login');
          }
        } catch {
          router.replace('/(auth)/login');
        }
      } else {
        router.replace('/(auth)/login');
      }
    }
    processCallback();
  }, [code, router]);

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
