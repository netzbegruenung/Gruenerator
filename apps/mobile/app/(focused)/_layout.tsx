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
      <Stack.Screen name="uebersetzer" options={{ ...toolHeader, title: 'Übersetzer' }} />
      <Stack.Screen name="vorlagen" options={{ ...toolHeader, title: 'Vorlagen' }} />
      <Stack.Screen name="profilbild" options={{ ...toolHeader, title: 'Profilbild' }} />
      <Stack.Screen name="sticker" options={{ ...toolHeader, title: 'Sticker & Hintergründe' }} />
      <Stack.Screen name="marktplatz" options={{ ...toolHeader, title: 'Marktplatz' }} />
      <Stack.Screen
        name="marktplatz/landesverband/[slug]"
        options={{ ...toolHeader, title: 'Marktplatz' }}
      />
      <Stack.Screen name="sticker-neu" options={{ ...toolHeader, title: 'Sticker erstellen' }} />
    </Stack>
  );
}
