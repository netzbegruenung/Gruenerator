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
  /**
   * Derive the height from the width instead of setting it — for a tile whose
   * shape is known but whose size is not, because the width is a percentage.
   * Setting both would over-constrain the box and `aspectRatio` would be
   * ignored, so the two are exclusive here rather than at each call site.
   */
  aspectRatio?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A single bar — a line of text, a title, a thumbnail, a whole card. */
export function SkeletonBar({
  width = '100%',
  height = 13,
  aspectRatio,
  radius = 4,
  style,
}: SkeletonBarProps) {
  const color = useSkeletonColor();
  return (
    <View
      style={[
        { width, borderRadius: radius, backgroundColor: color },
        aspectRatio === undefined ? { height } : { aspectRatio },
        style,
      ]}
    />
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

/**
 * The two arrangements almost every loading surface in the app turns out to be.
 *
 * Both wrap themselves in a `SkeletonGroup`, so they are drop-in — and so they
 * must not be nested inside another one: two groups would multiply their
 * opacities and pulse the inner drawing down to a quarter.
 */

interface SkeletonRowsProps {
  /** How many rows to draw. Enough to fill the space, not to guess the count. */
  count?: number;
  /** Diameter of the leading badge, or `0` for a row without one. */
  leading?: number;
  /** Whether each row carries a second, shorter line under the title. */
  meta?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}

/** Badge, title, optional meta line — the shape `ListRow` draws. */
export function SkeletonRows({
  count = 4,
  leading = 44,
  meta = true,
  gap = 0,
  style,
}: SkeletonRowsProps) {
  // Ragged, so the block does not read as a table. Cycled, so any count works.
  const titleWidths = ['72%', '54%', '81%', '63%'] as const;

  return (
    <SkeletonGroup style={[{ gap }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={rowStyles.row}>
          {leading > 0 ? <SkeletonCircle size={leading} /> : null}
          <View style={rowStyles.text}>
            <SkeletonBar width={titleWidths[i % titleWidths.length]} height={15} />
            {meta ? <SkeletonBar width="38%" height={11} /> : null}
          </View>
        </View>
      ))}
    </SkeletonGroup>
  );
}

interface SkeletonTilesProps {
  count?: number;
  /** Tile width. A number pins it; leave it out for an even split across `columns`. */
  itemWidth?: number;
  columns?: number;
  gap?: number;
  /** Tile height as a share of its width — `1` is a square. */
  aspectRatio?: number;
  radius?: number;
  /** A caption bar under each tile, as a card with a title would have. */
  caption?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A wrapping grid of tiles — a card grid, a gallery, a shelf of thumbnails. */
export function SkeletonTiles({
  count = 6,
  itemWidth,
  columns = 2,
  gap = 12,
  aspectRatio = 1,
  radius = 12,
  caption = false,
  style,
}: SkeletonTilesProps) {
  const width: DimensionValue =
    itemWidth ?? (`${(100 - (columns - 1) * 2) / columns}%` as DimensionValue);

  return (
    <SkeletonGroup style={[rowStyles.grid, { gap }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width, gap: 8 }}>
          <SkeletonBar width="100%" aspectRatio={aspectRatio} radius={radius} />
          {caption ? <SkeletonBar width="70%" height={12} /> : null}
        </View>
      ))}
    </SkeletonGroup>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  text: { flex: 1, gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
