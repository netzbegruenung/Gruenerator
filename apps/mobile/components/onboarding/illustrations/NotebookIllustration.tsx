import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { NotebookIcon } from '../../icons/WebMirrorIcons';

/**
 * Notebooks slide: the web-mirrored notebook glyph with a magnifier that
 * sweeps across it in a slow loop — "searching the knowledge base".
 */
export function NotebookIllustration({ color, size }: { color: string; size: number }) {
  const t = useSharedValue(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [reduced, t]);

  const lensStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -14 + t.value * 28 }, { translateY: 12 - t.value * 22 }],
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <NotebookIcon color={color} size={size - 14} />
      <Animated.View style={[styles.lens, lensStyle]}>
        <Ionicons name="search" color={color} size={22} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lens: {
    position: 'absolute',
  },
});
