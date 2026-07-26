import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Tabs } from 'expo-router';
import { StyleSheet, useColorScheme, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme, darkTheme, colors } from '../../theme';
import { TAB_BAR_CAPSULE_HEIGHT, TAB_BAR_CAPSULE_GAP } from '../../theme/layout';
import { GrueneratorLoadingIcon } from '../chat/GrueneratorLoadingIcon';

import { useTabTint } from './useTabTint';

const ICON_SIZE = 21;
const CAPSULE_HEIGHT = TAB_BAR_CAPSULE_HEIGHT;
const CAPSULE_GAP = TAB_BAR_CAPSULE_GAP;
/** Widest the capsule gets, and how much room it always leaves at the edges. */
const CAPSULE_MAX_WIDTH = 210;
const CAPSULE_MIN_MARGIN = 24;

/**
 * The Android tab bar — iOS gets the real thing from NativeTabLayout, so this is
 * the only place the JS bottom tabs are styled. Shaped after the iOS 26 tab bar:
 * a floating capsule that hugs its two items instead of spanning the screen, with
 * screen content running underneath.
 */
export function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tint = useTabTint();

  // Two items need far less than the full width. Hug them, but never crowd the
  // screen edges on a narrow phone.
  const sideMargin = Math.max(CAPSULE_MIN_MARGIN, (width - CAPSULE_MAX_WIDTH) / 2);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: isDark ? colors.grey[300] : theme.textSecondary,
        // Keeps the bar out of the way while typing instead of stacking it above
        // the keyboard next to the composer.
        tabBarHideOnKeyboard: true,
        // The bar IS the capsule: absolutely positioned so the screen's gradient
        // and content continue behind and around it.
        tabBarStyle: {
          position: 'absolute',
          // Margin, not left/right: React Navigation sets its own left/right on
          // the bar container and those win, so positional insets are silently
          // ignored — the bar stays full width.
          marginHorizontal: sideMargin,
          bottom: insets.bottom + CAPSULE_GAP,
          height: CAPSULE_HEIGHT,
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: CAPSULE_HEIGHT / 2,
          borderTopWidth: 0,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.border,
          backgroundColor: theme.background,
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 6,
        },
        tabBarItemStyle: {
          height: CAPSULE_HEIGHT,
          paddingVertical: 0,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
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
          tabBarIcon: ({ color }) => (
            <GrueneratorLoadingIcon size={ICON_SIZE} color={color} loading={false} />
          ),
        }}
      />
      <Tabs.Screen
        name="(arbeiten)"
        options={{
          title: 'Arbeiten',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="briefcase" size={ICON_SIZE} color={color} />,
        }}
      />
      {/* Wissen is a tool tile on the Arbeiten tab now, not a tab of its own —
          same treatment as (office) and (tools) below. */}
      <Tabs.Screen name="(recherche)" options={{ href: null, headerShown: false }} />
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
