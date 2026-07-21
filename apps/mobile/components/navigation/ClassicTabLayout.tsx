import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme, darkTheme, colors } from '../../theme';
import { GrueneratorLoadingIcon } from '../chat/GrueneratorLoadingIcon';

import { useTabTint } from './useTabTint';

export function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const tint = useTabTint();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tint,
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
          title: 'Chat',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <GrueneratorLoadingIcon size={size} color={color} loading={false} />
          ),
        }}
      />
      <Tabs.Screen
        name="(arbeiten)"
        options={{
          title: 'Arbeiten',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="(recherche)"
        options={{
          title: 'Wissen',
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="(chat)" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="(office)" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="(tools)" options={{ href: null, headerShown: false }} />
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
