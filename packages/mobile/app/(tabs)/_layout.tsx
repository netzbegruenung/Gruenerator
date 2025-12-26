import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, colors } from '../../theme';

/**
 * Tab navigation layout
 * Main navigation structure for the app
 */
export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
        },
        headerStyle: {
          backgroundColor: theme.background,
        },
        headerTintColor: theme.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chat',
          tabBarLabel: 'Chat',
          // TODO: Add icons
        }}
      />
      <Tabs.Screen
        name="generators"
        options={{
          title: 'Generatoren',
          tabBarLabel: 'Generatoren',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarLabel: 'Profil',
        }}
      />
    </Tabs>
  );
}
