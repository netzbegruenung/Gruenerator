import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../../theme';

export default function MediaLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Medien', headerShown: false }} />
      <Stack.Screen name="reel" options={{ title: 'Reel' }} />
      <Stack.Screen name="image-studio" options={{ title: 'Image Studio', headerShown: false }} />
      <Stack.Screen name="vorlagen" options={{ href: null }} />
    </Stack>
  );
}
