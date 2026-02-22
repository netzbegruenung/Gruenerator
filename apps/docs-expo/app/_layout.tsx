import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Stack, Redirect, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
} from '@expo-google-fonts/raleway';
import { useAuthStore } from '@gruenerator/shared/stores';
import { lightTheme, darkTheme } from '../theme';
import { initializeApiClient } from '../services/api';
import { configureAuthStore, checkAuthStatus } from '../services/auth';
import { setAdapterRouter } from '../services/expoDocsAdapter';

console.log('[App] _layout.tsx loaded');
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const segments = useSegments();
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    setAdapterRouter(router);
  }, [router]);

  useEffect(() => {
    async function initialize() {
      try {
        console.log('[App] Starting init...');
        initializeApiClient();
        configureAuthStore();
        const authed = await checkAuthStatus();
        console.log(
          '[App] checkAuthStatus result:',
          authed,
          'user:',
          !!useAuthStore.getState().user
        );
      } catch (error) {
        console.error('[App] Initialization error:', error);
      }
    }
    initialize();
  }, []);

  const [fontsLoaded] = useFonts({
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
    Raleway_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isLoading]);

  if (!fontsLoaded || isLoading) {
    return null;
  }

  const isInAuthFlow = segments[0] === '(auth)' || segments[0] === 'auth';

  if (!user && !isInAuthFlow) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen
          name="document/[id]"
          options={{ headerShown: false, animation: 'slide_from_right' }}
        />
        <Stack.Screen name="(auth)/login" options={{ title: 'Anmelden', presentation: 'modal' }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
