import { Ionicons } from '@react-native-vector-icons/ionicons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet, View, useColorScheme, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { lightTheme, darkTheme, colors, BODY_FONT } from '../../theme';
import { TAB_BAR_CAPSULE_HEIGHT, TAB_BAR_CAPSULE_GAP } from '../../theme/layout';
import { GrueneratorLoadingIcon } from '../chat/GrueneratorLoadingIcon';

import {
  TabBarBlurTargetProvider,
  useTabBarBlurEnabled,
  useTabBarBlurTarget,
} from './TabBarBlurTarget';
import { useTabTint } from './useTabTint';

const ICON_SIZE = 21;
const CAPSULE_HEIGHT = TAB_BAR_CAPSULE_HEIGHT;
const CAPSULE_GAP = TAB_BAR_CAPSULE_GAP;
/** Widest the capsule gets, and how much room it always leaves at the edges. */
const CAPSULE_MAX_WIDTH = 380;
const CAPSULE_MIN_MARGIN = 14;

/**
 * Fill under the blur. Two jobs: it keeps the labels legible against whatever
 * scrolls past, and it is the whole appearance wherever the blur cannot run —
 * `dimezisBlurViewSdk31Plus` falls back to no blur below Android 12, and
 * `BlurView` does the same whenever no blur target is registered. Without it
 * those cases would leave a transparent capsule with floating icons.
 */
const CAPSULE_FILL_LIGHT = 'rgba(255, 255, 255, 0.55)';
const CAPSULE_FILL_DARK = 'rgba(10, 12, 11, 0.5)';

/** Opaque counterparts, used when the user asked for less transparency. */
const CAPSULE_SOLID_LIGHT = 'rgb(250, 250, 249)';
const CAPSULE_SOLID_DARK = 'rgb(10, 12, 11)';

/**
 * The capsule's translucent backdrop. Lives in its own component so it renders
 * inside the navigator — and therefore inside `TabBarBlurTargetProvider`, where
 * the focused screen's blur target is published.
 */
function TabBarBackground({ isDark }: { isDark: boolean }) {
  const blurTarget = useTabBarBlurTarget();
  // Either "Transparenz reduzieren" or the performance mode. Both end here, and
  // both mean the same thing for this view.
  const blurEnabled = useTabBarBlurEnabled();

  // A plain View rather than a BlurView at intensity 0: the native side already
  // ends up at `setBlurEnabled(false)` there, so the two render identically —
  // this way the screen also skips publishing a blur target and the native blur
  // view never gets mounted. The opaque fill is what the bar looked like
  // whenever the blur could not run anyway (below Android 12, or with no target
  // registered), so nothing new had to be designed for this state.
  if (!blurEnabled) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          styles.capsuleBackground,
          { backgroundColor: isDark ? CAPSULE_SOLID_DARK : CAPSULE_SOLID_LIGHT },
        ]}
      />
    );
  }

  return (
    <BlurView
      // SDK31Plus rather than the unconditional method: below Android 12 the
      // library falls back to RenderScript, which is slow enough to be felt on
      // a view that is on screen the whole time.
      blurMethod="dimezisBlurViewSdk31Plus"
      blurTarget={blurTarget}
      intensity={60}
      tint={isDark ? 'dark' : 'light'}
      style={[
        StyleSheet.absoluteFill,
        styles.capsuleBackground,
        { backgroundColor: isDark ? CAPSULE_FILL_DARK : CAPSULE_FILL_LIGHT },
      ]}
    />
  );
}

/**
 * The Android tab bar — iOS gets the real thing from NativeTabLayout, so this is
 * the only place the JS bottom tabs are styled. Shaped after the iOS 26 tab bar:
 * a floating capsule that hugs its items instead of spanning the screen, with
 * screen content running underneath.
 */
export function ClassicTabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tint = useTabTint();

  // Hug the items rather than spanning the screen, but never crowd the edges on
  // a narrow phone.
  const sideMargin = Math.max(CAPSULE_MIN_MARGIN, (width - CAPSULE_MAX_WIDTH) / 2);

  return (
    <TabBarBlurTargetProvider>
      <Tabs
        screenOptions={{
          // Explicit rather than leaning on the global `enableFreeze` in the root
          // layout: this is the navigator where it matters most, and a screen
          // option survives someone deleting that call by accident.
          freezeOnBlur: true,
          tabBarActiveTintColor: tint,
          tabBarInactiveTintColor: isDark ? colors.grey[300] : theme.textSecondary,
          // Keeps the bar out of the way while typing instead of stacking it above
          // the keyboard next to the composer.
          tabBarHideOnKeyboard: true,
          tabBarBackground: () => <TabBarBackground isDark={isDark} />,
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
            // The backdrop is TabBarBackground now. `overflow: hidden` is what
            // makes it respect the capsule radius — borderRadius alone does not
            // clip a native blur view.
            backgroundColor: 'transparent',
            overflow: 'hidden',
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
            fontFamily: BODY_FONT,
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
        <Tabs.Screen
          name="(studio)"
          options={{
            title: 'Studio',
            headerShown: false,
            tabBarIcon: ({ color }) => (
              <Ionicons name="color-palette" size={ICON_SIZE} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="(recherche)"
          options={{
            title: 'Wissen',
            headerShown: false,
            tabBarIcon: ({ color }) => <Ionicons name="book" size={ICON_SIZE} color={color} />,
          }}
        />
        {/* Reachable, but not from the bar: the individual Studio tools sit behind
          the Studio tab, and the chat group behind the Chat tab. */}
        <Tabs.Screen name="(chat)" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="(tools)" options={{ href: null, headerShown: false }} />
      </Tabs>
    </TabBarBlurTargetProvider>
  );
}

const styles = StyleSheet.create({
  capsuleBackground: {
    borderRadius: CAPSULE_HEIGHT / 2,
  },
});
