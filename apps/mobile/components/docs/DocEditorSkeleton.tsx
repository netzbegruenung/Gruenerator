import { View, StyleSheet, useColorScheme } from 'react-native';

import { lightTheme, darkTheme, spacing } from '../../theme';
import { SkeletonBar, SkeletonGroup, SkeletonLines, skeletonStyles } from '../common/Skeleton';

// Placeholder paragraph layout (line width %) — a title bar followed by a few
// blocks of body lines, approximating a document while it connects/syncs.
const LINES = ['62%', '100%', '94%', '88%', '70%', '100%', '91%', '55%'] as const;

/**
 * Loading placeholder shown over the document body while the editor connects and
 * performs its first Yjs sync (2-5s). Replaces the previous blank screen + red dot.
 */
export function DocEditorSkeleton() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={[skeletonStyles.fill, { backgroundColor: theme.background }]} pointerEvents="none">
      <SkeletonGroup style={styles.content}>
        <SkeletonBar width="62%" height={26} radius={6} />
        <View style={styles.spacer} />
        <SkeletonLines widths={LINES} gap={12} />
      </SkeletonGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.large,
    gap: 12,
  },
  spacer: {
    height: 4,
  },
});
