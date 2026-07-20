import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../../theme';

export default function DocsLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
