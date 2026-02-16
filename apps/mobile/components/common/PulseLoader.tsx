import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  FadeIn,
} from 'react-native-reanimated';

import { colors, spacing, lightTheme, darkTheme, typography } from '../../theme';

import type { ComponentProps } from 'react';

const RING_SIZE = 160;
const RING_COUNT = 3;
const CYCLE_DURATION = 2400;
const STAGGER = CYCLE_DURATION / RING_COUNT;

interface PulseLoaderProps {
  title: string;
  subtitle?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  ringColor?: string;
  dotColor?: string;
  iconColor?: string;
}

function PulsingRing({ delay, color }: { delay: number; color: string }) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 0 }),
          withTiming(1, { duration: CYCLE_DURATION, easing: Easing.out(Easing.cubic) })
        ),
        -1
      )
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.5, { duration: 0 }),
          withTiming(0, { duration: CYCLE_DURATION, easing: Easing.in(Easing.quad) })
        ),
        -1
      )
    );
  }, [delay, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
    borderColor: color,
  }));

  return <Animated.View style={[styles.ring, animatedStyle]} />;
}

function FloatingDot({
  delay,
  offsetX,
  offsetY,
  color,
}: {
  delay: number;
  offsetX: number;
  offsetY: number;
  color: string;
}) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(-12, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        ),
        -1
      )
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.3, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.8, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        ),
        -1
      )
    );
  }, [delay, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX }, { translateY: translateY.value + offsetY }],
    opacity: opacity.value,
    backgroundColor: color,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

const DOT_POSITIONS = [
  { offsetX: -55, offsetY: -40, delay: 0 },
  { offsetX: 50, offsetY: -30, delay: 400 },
  { offsetX: -35, offsetY: 45, delay: 800 },
  { offsetX: 60, offsetY: 35, delay: 1200 },
];

export function PulseLoader({
  title,
  subtitle,
  icon = 'sparkles',
  ringColor: ringColorProp,
  dotColor: dotColorProp,
  iconColor: iconColorProp,
}: PulseLoaderProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const iconPulse = useSharedValue(1);

  useEffect(() => {
    iconPulse.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
  }, [iconPulse]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconPulse.value }],
  }));

  const ringColor = ringColorProp ?? (isDark ? colors.primary[400] : colors.primary[300]);
  const dotColor = dotColorProp ?? (isDark ? colors.primary[400] : colors.primary[500]);
  const resolvedIconColor = iconColorProp ?? colors.primary[500];

  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.container}>
      <View style={styles.animationArea}>
        {Array.from({ length: RING_COUNT }).map((_, i) => (
          <PulsingRing key={i} delay={i * STAGGER} color={ringColor} />
        ))}

        {DOT_POSITIONS.map((pos, i) => (
          <FloatingDot
            key={i}
            delay={pos.delay}
            offsetX={pos.offsetX}
            offsetY={pos.offsetY}
            color={dotColor}
          />
        ))}

        <Animated.View
          style={[
            styles.iconContainer,
            { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
            iconStyle,
          ]}
        >
          <Ionicons name={icon} size={32} color={resolvedIconColor} />
        </Animated.View>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {subtitle && (
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.large,
  },
  animationArea: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xlarge,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h3,
    marginBottom: spacing.xsmall,
  },
  subtitle: {
    ...typography.body,
  },
});
