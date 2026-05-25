import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
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

const TOOL_ICONS: IoniconsIconName[] = ['videocam', 'sparkles', 'mic', 'scan'];

/**
 * Tools slide: a 2×2 grid of tool glyphs that pop in sequence (staggered
 * scale loop) — the toolbox "assembling" itself.
 */
export function ToolsIllustration({ color, size }: { color: string; size: number }) {
  const cell = size / 2 - 4;
  return (
    <View style={[styles.grid, { width: size, height: size }]}>
      {TOOL_ICONS.map((name, i) => (
        <ToolCell key={name} name={name} color={color} cell={cell} delay={i * 160} />
      ))}
    </View>
  );
}

function ToolCell({
  name,
  color,
  cell,
  delay,
}: {
  name: IoniconsIconName;
  color: string;
  cell: number;
  delay: number;
}) {
  const v = useSharedValue(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.5, { duration: 500, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [reduced, delay, v]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.5 + v.value * 0.5,
    transform: [{ scale: 0.8 + v.value * 0.2 }],
  }));

  return (
    <Animated.View style={[styles.cell, { width: cell, height: cell }, style]}>
      <Ionicons name={name} color={color} size={cell - 8} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
