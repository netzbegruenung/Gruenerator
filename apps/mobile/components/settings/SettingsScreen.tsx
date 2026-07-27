import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { spacing } from '../../theme';

/**
 * The shell every settings surface shares: a centered title with an optional
 * back arrow, over a scrolling column of grouped cards.
 *
 * `(focused)` screens set `headerShown: false`, so the header is ours to draw —
 * which is what keeps it identical to the composer's "+" sheet instead of
 * inheriting the platform navigation bar's look.
 */
interface Props {
  title: string;
  /** Shows the back arrow. Omit on the root settings tab. */
  canGoBack?: boolean;
  /** Optional so a screen can render its chrome while its data is still absent. */
  children?: ReactNode;
}

export function SettingsScreen({ title, canGoBack, children }: Props) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerButton}>
          {canGoBack && (
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Zurück">
              <Ionicons name="chevron-back" size={24} color={theme.text} />
            </Pressable>
          )}
        </View>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.medium,
  },
  headerButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Raleway_700Bold',
    fontSize: 22,
  },
  content: {
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.xxlarge,
    gap: spacing.medium,
  },
});
