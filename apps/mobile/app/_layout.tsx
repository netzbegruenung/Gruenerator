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
import { Stack, Redirect, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { enableFreeze } from 'react-native-screens';

import { AiConsentGate } from '../components/auth/AiConsentGate';
import { DomWarmup } from '../components/common/DomWarmup';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { AppDrawer } from '../components/navigation';
import { SettingsSheet } from '../components/settings';
import { useAppInitialization } from '../hooks/useAppInitialization';
import { queryClient } from '../services/queryClient';
import { useOnboardingStore } from '../stores/onboardingStore';
import { lightTheme, darkTheme } from '../theme';

void SplashScreen.preventAutoHideAsync();

// Local notifications only (the subtitle export tells you when it is done).
// Without a handler iOS swallows them while the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Stop re-rendering screens nobody is looking at.
 *
 * `react-native-screens` ships this OFF (`ENABLE_FREEZE = false` in its `core`),
 * so until now all four tab screens re-rendered on every store write, every
 * query settle and every theme read — the Wissen tab alone is 19 cover tiles
 * plus the user's collections in a plain `ScrollView`, and it paid that price
 * while sitting behind the Chat tab.
 *
 * Must run at module scope: `Screen` reads `freezeEnabled()` at render time, so
 * a call from inside a component would come too late for the first mount.
 *
 * Frozen means *not re-rendered*, not unmounted — effects, timers and requests
 * keep running, their state updates just land when the screen comes back. A
 * background export still finishes; only its progress bar stops repainting
 * while off screen.
 */
enableFreeze(true);

function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const segments = useSegments();
  const { user, isLoading } = useAuthStore();
  const hasCompletedOnboarding = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const hasHydratedOnboarding = useOnboardingStore((s) => s.hasHydrated);
  useAppInitialization();

  const [fontsLoaded] = useFonts({
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
    Raleway_700Bold,
    // PT Sans is NOT loaded here: it is linked natively by the expo-font config
    // plugin (app.json) as one family with weights, which is what makes
    // `fontWeight` select a real face instead of being ignored.
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
                {/* Settings are a sheet, not a route, so they open over whatever
                    is on screen. Mounted here — once — because the drawer and the
                    profile menu both reach for them from different screens. */}
                {user ? <SettingsSheet /> : null}
                {/* Off-screen preload of the `use dom` WebView bundles (docs
                    editor), so the first document a user opens doesn't pay for
                    the WebView boot. Retires itself. */}
                {user ? <DomWarmup /> : null}
                {/* Art.-9-Einwilligung. Ganz zuletzt und über allem, damit sie
                    auch über dem Einstellungen-Sheet steht — ein Widerruf dort
                    muss sofort wieder fragen, sonst liefe die App weiter ohne
                    Rechtsgrundlage. Gated auf `user`, weil vor der Anmeldung
                    niemand da ist, den man fragen könnte. */}
                {user ? <AiConsentGate /> : null}
              </ErrorBoundary>
            </ActionSheetProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;
