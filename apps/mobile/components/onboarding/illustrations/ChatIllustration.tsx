import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Chat slide: a speech bubble with a three-dot "typing" indicator. Each dot
 * lifts and brightens in sequence (staggered loop) — the universal "the
 * assistant is thinking" motion.
 */
export function ChatIllustration({ color, size }: { color: string; size: number }) {
  return (
    <View style={[styles.bubble, { width: size + 16, backgroundColor: `${color}22` }]}>
      <TypingDot color={color} delay={0} />
      <TypingDot color={color} delay={180} />
      <TypingDot color={color} delay={360} />
    </View>
  );
}

function TypingDot({ color, delay }: { color: string; delay: number }) {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [reduced, delay, v]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + v.value * 0.6,
    transform: [{ translateY: -v.value * 5 }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  bubble: {
    height: 44,
    borderRadius: 18,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
});
