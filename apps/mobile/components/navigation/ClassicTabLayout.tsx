import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme, darkTheme, colors } from '../../theme';
import { GrueneratorLoadingIcon } from '../chat/GrueneratorLoadingIcon';
import { NotebookIcon } from '../icons/WebMirrorIcons';

export function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary[600],
        tabBarInactiveTintColor: colorScheme === 'dark' ? colors.grey[300] : theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom, 12) + 8,
          paddingTop: 8,
          height: 56 + Math.max(insets.bottom, 12) + 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="start"
        options={{
          title: 'Start',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <GrueneratorLoadingIcon size={size} color={color} loading={false} />
          ),
        }}
      />
      <Tabs.Screen name="(chat)" options={{ href: null, headerShown: false }} />
      <Tabs.Screen
        name="(docs)"
        options={{
          title: 'Docs',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(tools)"
        options={{
          title: 'Tools',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="construct" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(recherche)"
        options={{
          title: 'Notebooks',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <NotebookIcon color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
