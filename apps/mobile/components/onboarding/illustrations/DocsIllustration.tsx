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

const LINES = [1, 0.8, 0.92, 0.55];

/**
 * Documents slide: a page whose text lines "write" themselves — each bar grows
 * from the left in sequence, then clears, in a looping stagger. Evokes drafting
 * a document in the editor.
 */
export function DocsIllustration({ color, size }: { color: string; size: number }) {
  const pageWidth = size * 0.72;
  return (
    <View style={[styles.page, { width: pageWidth, height: size, borderColor: color }]}>
      {LINES.map((fraction, i) => (
        <WritingLine key={fraction} color={color} fraction={fraction} delay={i * 220} />
      ))}
    </View>
  );
}

function WritingLine({
  color,
  fraction,
  delay,
}: {
  color: string;
  fraction: number;
  delay: number;
}) {
  const v = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      v.value = 1;
      return;
    }
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
          withDelay(900, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }))
        ),
        -1,
        false
      )
    );
  }, [reduced, delay, v]);

  const style = useAnimatedStyle(() => ({
    width: `${v.value * fraction * 100}%`,
    opacity: 0.35 + v.value * 0.65,
  }));

  return <Animated.View style={[styles.line, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  page: {
    borderWidth: 2.5,
    borderRadius: 8,
    borderCurve: 'continuous',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },
  line: {
    height: 5,
    borderRadius: 2.5,
  },
});
