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
const DOTS = Array.from({ length: COLUMNS * COLUMNS }, (_, i) => i);
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

export const ImageGenerationFrame = memo(function ImageGenerationFrame({
  theme,
}: {
  theme: Theme;
}) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="progressbar"
      accessibilityLabel="Bild wird generiert"
    >
      <View style={[styles.frame, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {DOTS.map((dot) => (
          <Dot key={dot} index={dot} color={theme.textSecondary} />
        ))}
      </View>
      <ShimmerText mutedColor={theme.textSecondary} brightColor={theme.text} fontSize={12}>
        Bild wird generiert …
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
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.medium,
  },
  // The cell carries the grid geometry, the dot only its own size — a
  // percentage-sized dot would stretch with the frame instead of staying a dot.
  cell: {
    width: `${100 / COLUMNS}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
