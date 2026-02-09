/**
 * Image Studio Stack Layout
 * Enables native back gestures on iOS and Android
 */

import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../../../theme';

export default function ImageStudioLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        contentStyle: {
          backgroundColor: theme.background,
        },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="image" />
      <Stack.Screen name="ki-input" />
      <Stack.Screen
        name="result"
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="gallery"
        options={{
          animation: 'slide_from_right',
        }}
      />
    </Stack>
  );
}
