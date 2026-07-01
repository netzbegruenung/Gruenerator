import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// Native analog of web's `.shimmer-text` (packages/chat ShimmerText). Web uses a
// `background-clip: text` gradient that animates `background-position`; React
// Native can't clip a gradient to glyphs, so we mask an animated LinearGradient
// with the text itself. The gradient is twice the text width and translates
// `-width → +width` on a 2s linear loop, matching web's `@keyframes shimmer-text`.

const SHIMMER_DURATION_MS = 2000;

interface ShimmerTextProps {
  children: string;
  /** Dim base color (web: --color-foreground-muted). */
  mutedColor: string;
  /** Bright sweep color (web: --color-foreground). */
  brightColor: string;
  fontSize?: number;
  style?: TextStyle;
}

export function ShimmerText({
  children,
  mutedColor,
  brightColor,
  fontSize = 14,
  style,
}: ShimmerTextProps) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION_MS, easing: Easing.linear }),
      -1
    );
  }, [progress]);

  const gradientStyle = useAnimatedStyle(() => ({
    // Sweep the 2×-wide gradient from fully left of the text to fully right.
    transform: [{ translateX: -width + progress.value * (2 * width) }],
  }));

  const textStyle: TextStyle = { fontSize, lineHeight: fontSize * 1.4, ...style };

  // Before layout is measured, render plain muted text so there's no flash.
  if (width === 0) {
    return (
      <Text
        style={[textStyle, { color: mutedColor }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {children}
      </Text>
    );
  }

  return (
    <MaskedView
      style={{ height: textStyle.lineHeight as number, width }}
      maskElement={<Text style={[textStyle, styles.mask]}>{children}</Text>}
    >
      {/* Muted base fills the glyphs… */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: mutedColor }]} />
      {/* …and the bright band sweeps across on top. */}
      <Animated.View style={[styles.sweep, { width: 2 * width }, gradientStyle]}>
        <LinearGradient
          colors={[mutedColor, brightColor, mutedColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  mask: {
    backgroundColor: 'transparent',
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
});
