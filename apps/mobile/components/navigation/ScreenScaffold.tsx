import { Ionicons } from '@react-native-vector-icons/ionicons';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, lightTheme, darkTheme } from '../../theme';

import { ProfileMenu } from './ProfileMenu';
import { SidebarMenuButton } from './SidebarMenuButton';
import { useRegisterTabBarBlurTarget } from './TabBarBlurTarget';

/**
 * Shared tab-screen chrome: top-safe area + the app gradient background + the standard
 * header bar (drawer button · centered title · profile menu). Screens render only their
 * own content as children.
 *
 * Pass `backdrop` to layer a per-tab background behind the content (the mobile echoes of
 * the web workplace's per-tab tints: Chat sunrise, Wissen pink, Arbeiten flat). It renders
 * above the default app gradient but below the header + content.
 *
 * `action` puts one screen-specific control left of the profile menu (the chat's
 * "new conversation"), so a screen never needs a header of its own.
 *
 * `onBack` swaps the drawer button for a back arrow. That is what the pushed
 * screens (Agentura, Projekte) use: same chrome as the tabs, but the leading
 * control has to lead somewhere — a hamburger on a screen you arrived at by
 * pushing offers the wrong way out.
 */
export function ScreenScaffold({
  title,
  children,
  backdrop,
  action,
  onBack,
}: {
  title: string;
  children: ReactNode;
  backdrop?: ReactNode;
  action?: ReactNode;
  onBack?: () => void;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  // What the Android tab bar blurs: the whole screen, gradient included. On iOS
  // `BlurTargetView` is a plain View, so this costs nothing there.
  const blurTargetRef = useRegisterTabBarBlurTarget();

  return (
    <BlurTargetView ref={blurTargetRef} style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LinearGradient
          colors={
            colorScheme === 'dark'
              ? [colors.grey[950], colors.grey[950]]
              : [colors.white, 'rgba(95, 133, 117, 0.05)']
          }
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        {backdrop}
        <View style={styles.header}>
          <View style={styles.headerSide}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={8}
                accessibilityLabel="Zurück"
                accessibilityRole="button"
                style={styles.backButton}
              >
                <Ionicons name="chevron-back" size={26} color={theme.text} />
              </Pressable>
            ) : (
              <SidebarMenuButton color={theme.text} size={24} />
            )}
          </View>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
          <View style={[styles.headerSide, styles.headerSideRight]}>
            {action}
            <ProfileMenu />
          </View>
        </View>
        {children}
      </SafeAreaView>
    </BlurTargetView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
  },
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  headerSideRight: { justifyContent: 'flex-end' },
  headerTitle: { fontFamily: 'Raleway_700Bold', fontSize: 20, textAlign: 'center' },
  // Same 40x40 hit area as SidebarMenuButton, so swapping the two does not
  // shift the title.
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
