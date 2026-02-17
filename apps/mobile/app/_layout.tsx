import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import {
  useFonts,
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
} from '@expo-google-fonts/raleway';
import { useAuthStore } from '@gruenerator/shared/stores';
import * as Notifications from 'expo-notifications';
import { Stack, Redirect, useSegments, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { useAppInitialization } from '../hooks/useAppInitialization';
import { lightTheme, darkTheme } from '../theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const segments = useSegments();
  const router = useRouter();
  const { user, isLoading } = useAuthStore();
  useAppInitialization();

  // Handle notification taps → navigate to pushed content screen
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'pushed_content' && data?.shareToken) {
        router.push(
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
    if (fontsLoaded && !isLoading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isLoading]);

  if (!fontsLoaded || isLoading) {
    return null;
  }

  const isInAuthFlow = segments[0] === '(auth)';

  if (!user && !isInAuthFlow) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ActionSheetProvider>
          <ErrorBoundary>
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
          </ErrorBoundary>
        </ActionSheetProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
