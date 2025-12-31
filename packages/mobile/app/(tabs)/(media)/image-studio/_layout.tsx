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
      <Stack.Screen name="input" />
      <Stack.Screen name="image" />
      <Stack.Screen name="text" />
      <Stack.Screen name="ki-input" />
      <Stack.Screen name="customize" />
      <Stack.Screen name="result" />
    </Stack>
  );
}
