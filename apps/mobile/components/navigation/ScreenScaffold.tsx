import { Ionicons } from '@react-native-vector-icons/ionicons';
import { BlurTargetView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactElement, type ReactNode } from 'react';
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
 * `headerRight` is the trailing slot, and it holds exactly ONE control. It
 * defaults to the profile menu; a screen that has something more useful to put
 * there replaces it (Arbeiten and Studio: the grid/list switch). It used to be
 * two props — a free `action` slot AND a `showProfile` flag — which let a screen
 * put two controls side by side and squeeze the title between them. One slot
 * makes that impossible rather than merely discouraged. `ReactElement` rather
 * than `ReactNode` for the same reason: an array does not typecheck.
 *
 * Pass `headerRight={null}` to give the title the whole bar. The chat does: agent
 * names run to 45 characters ("Bürger*innenanfragen (Mecklenburg-Vorpommern)"),
 * and naming the agent matters more there than a control that is one tap away
 * through the drawer anyway.
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
  onBack,
  headerRight = <ProfileMenu />,
}: {
  title: string;
  children: ReactNode;
  backdrop?: ReactNode;
  onBack?: () => void;
  headerRight?: ReactElement | null;
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
          {/* Agent names run longer than the tab titles this header was built
              for — without this a long one wraps and grows the whole bar. */}
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.headerSide, styles.headerSideRight]}>{headerRight}</View>
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
  // flex:1 on both sides keeps a short title exactly centred. `minWidth` is what
  // stops a long one from collapsing them: with a zero flex-basis they shrank to
  // nothing and the title drew straight over the drawer button.
  headerSide: {
    flex: 1,
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  headerSideRight: { justifyContent: 'flex-end' },
  // flexShrink lets the title give way to the sides instead of overrunning them.
  headerTitle: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 20,
    textAlign: 'center',
    flexShrink: 1,
  },
  // Same 40x40 hit area as SidebarMenuButton, so swapping the two does not
  // shift the title.
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
