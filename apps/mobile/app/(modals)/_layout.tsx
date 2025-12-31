import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, colors } from '../../theme';

export default function ModalsLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Stack
      screenOptions={{
        presentation: 'modal',
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: colors.primary[600],
        headerTitleStyle: {
          fontWeight: '600',
        },
        contentStyle: {
          backgroundColor: theme.background,
        },
        gestureEnabled: true,
        gestureDirection: 'vertical',
      }}
    >
      <Stack.Screen
        name="edit-chat"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
        }}
      />
      <Stack.Screen
        name="gruenerator-chat"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
        }}
      />
    </Stack>
  );
}
