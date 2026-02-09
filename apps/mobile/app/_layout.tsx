import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import {
  useFonts,
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  Raleway_700Bold,
} from '@expo-google-fonts/raleway';
import { useAuthStore } from '@gruenerator/shared/stores';
import { Stack, Redirect, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useAppInitialization } from '../hooks/useAppInitialization';
import { lightTheme, darkTheme } from '../theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const segments = useSegments();
  const { user, isLoading } = useAuthStore();
  useAppInitialization();

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
                name="(fullscreen)"
                options={{
                  headerShown: false,
                  presentation: 'fullScreenModal',
                  animation: 'fade',
                }}
              />
            </Stack>
          </View>
        </ActionSheetProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
