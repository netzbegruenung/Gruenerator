import { type ComponentType } from 'react';
import { Text, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

/**
 * A single onboarding page: an animated illustration inside a eucalyptus-tinted
 * circular badge, above a Raleway heading and body subtitle. Both layers are
 * driven by the carousel's continuous scroll `progress` (page index + offset)
 * so they parallax at different speeds and fade at the edges as the user swipes
 * — the illustration owns its own ambient loop on top of that.
 */
export function OnboardingSlide({
  index,
  progress,
  Illustration,
  title,
  subtitle,
}: {
  index: number;
  progress: SharedValue<number>;
  Illustration: ComponentType<{ color: string; size: number }>;
  title: string;
  subtitle: string;
}) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const badgeColor = colorScheme === 'dark' ? colors.secondary[900] : 'rgba(95, 133, 117, 0.12)';
  const iconColor = colorScheme === 'dark' ? colors.secondary[300] : colors.secondary[600];

  // Illustration: background layer — gentle parallax, fades + shrinks at edges.
  const badgeStyle = useAnimatedStyle(() => {
    const d = progress.value - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.7], [1, 0], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(d, [-1, 0, 1], [50, 0, -50], Extrapolation.CLAMP) },
        { scale: interpolate(Math.abs(d), [0, 1], [1, 0.8], Extrapolation.CLAMP) },
      ],
    };
  });

  // Text: foreground layer — moves faster than the illustration for depth.
  const textStyle = useAnimatedStyle(() => {
    const d = progress.value - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(d, [-1, 0, 1], [90, 0, -90], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={styles.slide}>
      <Animated.View style={[styles.badge, { backgroundColor: badgeColor }, badgeStyle]}>
        <Illustration color={iconColor} size={72} />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xlarge,
  },
  badge: {
    width: 144,
    height: 144,
    borderRadius: borderRadius.full,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xlarge,
  },
  title: {
    fontFamily: 'Raleway_700Bold',
    fontSize: 28,
    textAlign: 'center',
    marginBottom: spacing.small,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
});
