import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

import { useTheme } from '../../../hooks/useTheme';
import { spacing } from '../../../theme';

function TypingDot({ delay, color }: { delay: number; color: string }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1
      )
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: color,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

/** Stands in for an assistant message that has no parts yet. */
export function TypingIndicator() {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <TypingDot delay={0} color={theme.textSecondary} />
      <TypingDot delay={150} color={theme.textSecondary} />
      <TypingDot delay={300} color={theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xsmall,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
