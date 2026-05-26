import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import {
  useFonts,
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
} from '@expo-google-fonts/raleway';
import { useAuthStore } from '@gruenerator/shared/stores';
import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { Stack, Redirect, useSegments, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { AppDrawer } from '../components/navigation';
import { useAppInitialization } from '../hooks/useAppInitialization';
import { queryClient } from '../services/queryClient';
import { useOnboardingStore } from '../stores/onboardingStore';
import { lightTheme, darkTheme } from '../theme';

void SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const segments = useSegments();
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  const hasCompletedOnboarding = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const hasHydratedOnboarding = useOnboardingStore((s) => s.hasHydrated);
  useAppInitialization();

  // Handle notification taps → navigate to pushed content screen
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'pushed_content' && data?.shareToken) {
        void router.push(
          `/(fullscreen)/pushed-content?shareToken=${data.shareToken}&mediaType=${data.mediaType || 'image'}`
        );
      }
    });

    return () => subscription.remove();
  }, [router]);

  const [fontsLoaded] = useFonts({
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
    Raleway_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded && !isLoading && hasHydratedOnboarding) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isLoading, hasHydratedOnboarding]);

  // Wait for the persisted onboarding flag too — deciding the redirect before it
  // rehydrates would flash the carousel at a returning user (defaults to false).
  if (!fontsLoaded || isLoading || !hasHydratedOnboarding) {
    return null;
  }

  const isInAuthFlow = segments[0] === '(auth)' || segments[0] === 'auth';

  if (!user && !isInAuthFlow) {
    return <Redirect href={hasCompletedOnboarding ? '/(auth)/login' : '/(auth)/onboarding'} />;
  }

  const appContent = (
    <View style={{ flex: 1 }}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: theme.background,
          },
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(auth)/onboarding"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(auth)/login"
          options={{
            title: 'Anmelden',
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="(modals)"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="(focused)"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="(fullscreen)"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
      </Stack>
    </View>
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <ActionSheetProvider>
              <ErrorBoundary>
                {/* AppDrawer (thread-list) wraps the whole Stack so threads/new-chat
                    are reachable from any screen — incl. the pushed (focused)
                    conversation. Gated on `user` to avoid an unauthenticated
                    thread-list fetch during the login flow. */}
                {user ? <AppDrawer>{appContent}</AppDrawer> : appContent}
              </ErrorBoundary>
            </ActionSheetProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;
