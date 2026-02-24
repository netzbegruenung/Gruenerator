import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { initializeApiClient } from '../../services/api';
import { handleAuthCallback, configureAuthStore } from '../../services/auth';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();

  useEffect(() => {
    async function processCallback() {
      if (code) {
        try {
          // Ensure API client is initialized (may be called before root layout's useEffect)
          initializeApiClient();
          configureAuthStore();

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

  return <View style={{ flex: 1 }} />;
}
