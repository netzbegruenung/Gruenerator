import { memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { spacing, borderRadius } from '../../theme';

import { ShimmerText } from './ShimmerText';

import type { Theme } from '../../theme/colors';

const COLUMNS = 8;
const LINES = Array.from({ length: COLUMNS }, (_, i) => i);
const PULSE_MS = 900;
/** Diagonal stagger: `row + col` makes the pulse sweep out of the top-left corner. */
const STAGGER_MS = 90;

/**
 * Placeholder frame shown while the backend is still generating an image —
 * before any pixels exist. Native counterpart of web's ImageGenerationFrame,
 * and it inherits the same shape: a pulsing dot grid inside the frame that
 * GeneratedImageDisplay later occupies, so the picture resolves into the space
 * the placeholder held rather than pushing the answer around when it lands.
 *
 * Web animates 64 `animate-pulse` spans with a CSS delay; React Native has no
 * cascade, so each dot owns a reanimated loop with its own delay. They run on
 * the UI thread, which is why 64 of them is affordable here.
 */
const Dot = memo(function Dot({ index, color }: { index: number; color: string }) {
  const opacity = useSharedValue(0.25);

  useEffect(() => {
    const row = Math.floor(index / COLUMNS);
    const col = index % COLUMNS;
    opacity.value = withDelay(
      (row + col) * STAGGER_MS,
      withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) }), -1, true)
    );
  }, [index, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.cell}>
      <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />
    </View>
  );
});

/**
 * The pulsing grid alone, filling its parent: a frame that has one of its own
 * uses it. Eight equal rows of eight equal cells, so the grid spans any shape
 * evenly — square for a picture, 4:5 for a sharepic — like CSS grid does on web.
 * (Square cells from a percentage width and `aspectRatio` in a wrapping row
 * came out squashed on Android and left the bottom of a 4:5 frame empty.)
 */
export const ImageGenerationDots = memo(function ImageGenerationDots({ color }: { color: string }) {
  return (
    <View style={styles.grid} aria-hidden>
      {LINES.map((row) => (
        <View key={row} style={styles.row}>
          {LINES.map((col) => (
            <Dot key={col} index={row * COLUMNS + col} color={color} />
          ))}
        </View>
      ))}
    </View>
  );
});

/**
 * `label` and `aspectRatio` let another picture in the making use the frame: a
 * sharepic is drafted in its card's 4:5 shape, so the card lands where the
 * placeholder stood.
 */
export const ImageGenerationFrame = memo(function ImageGenerationFrame({
  theme,
  label = 'Bild wird generiert …',
  aspectRatio = 1,
}: {
  theme: Theme;
  label?: string;
  aspectRatio?: number;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      <View
        style={[
          styles.frame,
          { aspectRatio, backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <ImageGenerationDots color={theme.textSecondary} />
      </View>
      <ShimmerText mutedColor={theme.textSecondary} brightColor={theme.text} fontSize={12}>
        {label}
      </ShimmerText>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xsmall,
    gap: spacing.xsmall,
    // Matches GeneratedImageDisplay's frame so the picture lands where the
    // placeholder stood instead of resizing the message under the reader.
    width: '100%',
    maxWidth: 320,
  },
  frame: {
    width: '100%',
    borderWidth: 1,
    borderRadius: borderRadius.medium,
  },
  grid: {
    flex: 1,
    padding: spacing.medium,
  },
  row: { flex: 1, flexDirection: 'row' },
  // The cell carries the grid geometry, the dot only its own size — a
  // flex-sized dot would stretch with the frame instead of staying a dot.
  cell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
