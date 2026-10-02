import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../theme';

export default function FocusedLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  // The tools draw no header of their own; the native one carries their title
  // and the way back.
  const toolHeader = {
    headerShown: true,
    headerStyle: { backgroundColor: theme.background },
    headerTintColor: theme.text,
    headerShadowVisible: false,
  };

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        gestureDirection: 'horizontal',
        contentStyle: {
          backgroundColor: theme.background,
        },
      }}
    >
      <Stack.Screen name="reel" options={{ ...toolHeader, title: 'Reel' }} />
      <Stack.Screen name="scanner" options={{ ...toolHeader, title: 'Scanner' }} />
      <Stack.Screen name="vorlagen" options={{ ...toolHeader, title: 'Vorlagen' }} />
    </Stack>
  );
}
