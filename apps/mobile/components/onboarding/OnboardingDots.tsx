import { StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, lightTheme, darkTheme } from '../../theme';

/**
 * Page indicator for the onboarding carousel. Each dot reacts to `progress`
 * (the continuous PagerView position, i.e. page index + scroll offset) so the
 * active dot smoothly widens and turns eucalyptus as the user swipes — rather
 * than snapping on page-change. Drive `progress` from PagerView's `onPageScroll`.
 */
export function OnboardingDots({
  count,
  progress,
}: {
  count: number;
  progress: SharedValue<number>;
}) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} progress={progress} />
      ))}
    </View>
  );
}

function Dot({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const active = colors.secondary[600];

  const style = useAnimatedStyle(() => {
    const distance = Math.abs(progress.value - index);
    return {
      width: interpolate(distance, [0, 1], [24, 8], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(distance, [0, 1], [active, theme.border]),
    };
  });

  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
