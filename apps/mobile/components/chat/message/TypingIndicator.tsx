import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../../hooks/useTheme';

// Native twin of web's `.typing-dot` (packages/chat styles/chat.css). Same
// geometry and the same 1.4s cycle: ramp up to 30 %, back down by 60 %, hold for
// the rest, staggered 0.2s per dot. One 0→1 clock per dot with both channels
// interpolated off it, because CSS applies its ease-in-out per keyframe pair
// rather than across the whole timeline.

const CYCLE_MS = 1400;
/** 0 % → 30 % of the cycle, and 30 % → 60 % back down. */
const RAMP_MS = CYCLE_MS * 0.3;
/** 60 % → 100 %: dim, waiting for the next cycle. */
const HOLD_MS = CYCLE_MS * 0.4;
const STAGGER_MS = 200;

const DOT_SIZE = 6;

function TypingDot({ delay, color }: { delay: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: RAMP_MS, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: RAMP_MS, easing: Easing.inOut(Easing.ease) }),
          withDelay(HOLD_MS, withTiming(0, { duration: 0 }))
        ),
        -1
      )
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.3, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.8, 1]) }],
    backgroundColor: color,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

/** Stands in for an assistant turn that has nothing concrete to report yet. */
export function TypingIndicator() {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <TypingDot delay={0} color={theme.textSecondary} />
      <TypingDot delay={STAGGER_MS} color={theme.textSecondary} />
      <TypingDot delay={STAGGER_MS * 2} color={theme.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
