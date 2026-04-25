import { useAuthStore } from '@gruenerator/shared/stores';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

import { initializeApiClient } from '../../services/api';
import { configureAuthStore, handleAuthCallback } from '../../services/auth';
import { colors } from '../../theme';

export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const user = useAuthStore((state) => state.user);

  const { data, isError } = useQuery({
    queryKey: ['auth-callback', code],
    queryFn: async () => {
      initializeApiClient();
      configureAuthStore();
      return handleAuthCallback(code!);
    },
    enabled: !!code && !user,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  });

  if (user || data?.success) {
    return <Redirect href="/(tabs)" />;
  }
  if (!code || isError || (data && !data.success)) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.white} />
      <Text style={styles.text}>Anmeldung wird abgeschlossen…</Text>
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
