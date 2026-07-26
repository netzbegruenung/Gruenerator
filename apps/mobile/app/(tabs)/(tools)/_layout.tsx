import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../../theme';

export default function ToolsLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Tools', headerShown: false }} />
      <Stack.Screen name="reel" options={{ title: 'Reel' }} />
      <Stack.Screen name="ki-bildgenerierung" options={{ title: 'KI-Bildgenerierung' }} />
      <Stack.Screen name="scanner" options={{ title: 'Scanner' }} />
      <Stack.Screen name="image-studio" options={{ title: 'Image Studio', headerShown: false }} />
      <Stack.Screen name="vorlagen" options={{ headerShown: false }} />
    </Stack>
  );
}
