import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, lightTheme, darkTheme } from '../../theme';

import { ProfileMenu } from './ProfileMenu';
import { SidebarMenuButton } from './SidebarMenuButton';

/**
 * Shared tab-screen chrome: top-safe area + the app gradient background + the standard
 * header bar (drawer button · centered title · profile menu). Screens render only their
 * own content as children. Replaces the header/gradient/SafeAreaView trio that was
 * duplicated across start, tools, notebooks and (now) docs.
 */
export function ScreenScaffold({ title, children }: { title: string; children: ReactNode }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <SidebarMenuButton color={theme.text} size={24} />
        </View>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{title}</Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <ProfileMenu />
        </View>
      </View>
      {children}
    </SafeAreaView>
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
  headerSide: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerSideRight: { justifyContent: 'flex-end' },
  headerTitle: { fontFamily: 'Raleway_700Bold', fontSize: 20, textAlign: 'center' },
});
