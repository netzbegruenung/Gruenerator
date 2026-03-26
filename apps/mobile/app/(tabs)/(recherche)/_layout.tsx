import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';

import { lightTheme, darkTheme } from '../../../theme';

export default function RechercheLayout() {
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
      <Stack.Screen
        name="suche"
        options={{ headerShown: true, title: 'Suche', headerTintColor: theme.text, headerStyle: { backgroundColor: theme.background } }}
      />
      <Stack.Screen
        name="research"
        options={{ headerShown: true, title: 'Recherche', headerTintColor: theme.text, headerStyle: { backgroundColor: theme.background } }}
      />
    </Stack>
  );
}
