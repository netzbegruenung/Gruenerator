import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../../theme';

export default function ImageStudioCreateLayout() {
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
      <Stack.Screen name="image" />
      <Stack.Screen name="ki-input" />
      <Stack.Screen
        name="result"
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade',
        }}
      />
    </Stack>
  );
}
