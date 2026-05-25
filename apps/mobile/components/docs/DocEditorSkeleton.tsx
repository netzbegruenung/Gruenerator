import { useEffect } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { lightTheme, darkTheme, spacing } from '../../theme';

// Placeholder paragraph layout (line width %) — a title bar followed by a few
// blocks of body lines, approximating a document while it connects/syncs.
const LINES = ['62%', '100%', '94%', '88%', '70%', '100%', '91%', '55%'] as const;

/**
 * Loading placeholder shown over the document body while the editor connects and
 * performs its first Yjs sync (2-5s). Replaces the previous blank screen + red dot.
 * A subtle opacity pulse signals "loading"; bars use `theme.surface` to match the
 * docs-list skeleton.
 */
export function DocEditorSkeleton() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]} pointerEvents="none">
      <Animated.View style={[styles.content, animatedStyle]}>
        <View style={[styles.title, { backgroundColor: theme.surface }]} />
        <View style={styles.spacer} />
        {LINES.map((width, i) => (
          <View key={i} style={[styles.line, { width, backgroundColor: theme.surface }]} />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.large,
    gap: 12,
  },
  title: {
    height: 26,
    width: '62%',
    borderRadius: 6,
  },
  spacer: {
    height: 4,
  },
  line: {
    height: 13,
    borderRadius: 4,
  },
});
