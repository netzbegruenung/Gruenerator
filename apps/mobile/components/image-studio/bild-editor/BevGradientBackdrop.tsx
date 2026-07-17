import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { type BevPalette } from './palette';

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => mounted && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * The two stacked backdrop layers from the web page: a static warm radial
 * (approximated with a vertical gradient) and an animated 5-stop gradient that
 * fades in only while generating. Motion mirrors web's `bwgradient` keyframe.
 */
export function BevGradientBackdrop({
  palette,
  generating,
}: {
  palette: BevPalette;
  generating: boolean;
}) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(0);
  const shift = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(generating ? 1 : 0, { duration: 1000 });
  }, [generating, opacity]);

  useEffect(() => {
    if (reduceMotion) return;
    shift.value = withRepeat(
      withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [reduceMotion, shift]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: interpolate(shift.value, [0, 1], [-0.18 * width, 0.18 * width]) }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={palette.radialStops}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.wide, animStyle]}>
        <LinearGradient
          colors={palette.generatingStops}
          locations={[0, 0.28, 0.5, 0.76, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/**
 * The edit-loading placeholder card (web's 16:10 breathing gradient + sheen).
 * Reveal blur is approximated with opacity+scale — RN has no cheap glyph blur.
 */
export function BevLoadingCard({
  palette,
  statusText,
}: {
  palette: BevPalette;
  statusText: string;
}) {
  const { width: winWidth } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const breathe = useSharedValue(0);
  const sheen = useSharedValue(0);

  const cardWidth = Math.min(560, winWidth - 48);

  useEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(
      withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    sheen.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1
    );
  }, [reduceMotion, breathe, sheen]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1, 1.015]) }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(sheen.value, [0, 1], [-cardWidth, cardWidth]) },
      { skewX: '-14deg' },
    ],
  }));

  return (
    <Animated.View style={[styles.loadingCard, { width: cardWidth }, cardStyle]}>
      <LinearGradient
        colors={palette.editStops}
        locations={[0, 0.26, 0.5, 0.74, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.sheen, { width: cardWidth * 0.45 }, sheenStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.loadingLabel}>
        <Text style={styles.loadingText}>{statusText}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '-15%',
    right: '-15%',
  },
  loadingCard: {
    aspectRatio: 16 / 10,
    borderRadius: 15,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  loadingLabel: {
    paddingHorizontal: 16,
  },
  loadingText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(35,55,46,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});
