import { useEffect } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { useReduceMotion } from '../../hooks/useAccessibilityPreferences';
import { lightTheme, darkTheme } from '../../theme';

import type { ReactNode } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';

/**
 * The bones every loading placeholder in the app is drawn from.
 *
 * A skeleton is a promise about the layout: it claims the space the real thing
 * will take, in roughly its shape, so the surface does not jump when the data
 * lands. That only works where the shape is known ahead of time — a list, a
 * card grid, an editor body. Where a *handler* is running instead of a surface
 * loading (a button that was pressed, an export, a download), the honest
 * placeholder is still an `ActivityIndicator`; nothing about the outcome's
 * layout is known yet.
 *
 * Two things every skeleton needs and that are easy to forget one at a time,
 * which is why they live here and not in each drawing:
 *
 *  - **The pulse stops for "Animationen reduzieren".** An endless opacity loop
 *    is exactly the kind of motion that setting is about, and a skeleton is
 *    on screen at the moment the user has nothing else to look at. Held still
 *    the bars sit at full opacity — a static skeleton, not a dimmed one.
 *  - **Screen readers skip it.** The bars carry no information a reader could
 *    voice; announcing eight empty views is worse than announcing nothing. The
 *    surface underneath is responsible for saying that it is loading.
 */

const PULSE_MIN = 0.5;
const PULSE_DURATION = 800;

/**
 * The opacity loop, as an animated style. Use it directly only when a skeleton
 * cannot be wrapped in a single `SkeletonGroup` (an overlay split across two
 * containers, say); otherwise prefer the group, which also does the a11y half.
 */
export function useSkeletonPulse() {
  const reduceMotion = useReduceMotion();
  const pulse = useSharedValue(reduceMotion ? 1 : PULSE_MIN);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = PULSE_MIN;
    pulse.value = withRepeat(
      withTiming(1, { duration: PULSE_DURATION, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse, reduceMotion]);

  return useAnimatedStyle(() => ({ opacity: pulse.value }));
}

/** The colour the bars are painted in — `theme.surface`, one step off the page. */
export function useSkeletonColor(): string {
  const colorScheme = useColorScheme();
  return (colorScheme === 'dark' ? darkTheme : lightTheme).surface;
}

interface SkeletonGroupProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Wraps a drawing of bars: pulses them together, keeps them out of the
 * accessibility tree, and lets touches through to whatever is underneath.
 */
export function SkeletonGroup({ children, style }: SkeletonGroupProps) {
  const pulseStyle = useSkeletonPulse();

  return (
    <Animated.View
      style={[style, pulseStyle]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </Animated.View>
  );
}

interface SkeletonBarProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A single bar — a line of text, a title, a thumbnail, a whole card. */
export function SkeletonBar({ width = '100%', height = 13, radius = 4, style }: SkeletonBarProps) {
  const color = useSkeletonColor();
  return (
    <View style={[{ width, height, borderRadius: radius, backgroundColor: color }, style]} />
  );
}

interface SkeletonCircleProps {
  size: number;
  style?: StyleProp<ViewStyle>;
}

/** A round bar — an avatar, an icon slot, a status dot. */
export function SkeletonCircle({ size, style }: SkeletonCircleProps) {
  const color = useSkeletonColor();
  return (
    <View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

interface SkeletonLinesProps {
  /** One entry per line; the value is that line's width. */
  widths: readonly DimensionValue[];
  height?: number;
  gap?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A block of text lines of ragged width. */
export function SkeletonLines({
  widths,
  height = 13,
  gap = 8,
  radius = 4,
  style,
}: SkeletonLinesProps) {
  return (
    <View style={[{ gap }, style]}>
      {widths.map((width, i) => (
        <SkeletonBar key={i} width={width} height={height} radius={radius} />
      ))}
    </View>
  );
}

/** Only exported so skeletons can share the "absolutely fills its parent" box. */
export const skeletonStyles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
