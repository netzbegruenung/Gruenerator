/**
 * ToolPill Component
 * Generic tappable pill button for editor toolbars
 */

import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { Pressable, Text, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  interpolateColor,
} from 'react-native-reanimated';

import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type ToolType = string;

export interface ToolPillProps {
  id: ToolType;
  label: string;
  icon: IoniconsIconName;
  isActive: boolean;
  onPress: () => void;
  badge?: number;
  showChevron?: boolean;
  disabled?: boolean;
}

export function ToolPill({
  id,
  label,
  icon,
  isActive,
  onPress,
  badge,
  showChevron = true,
  disabled = false,
}: ToolPillProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const activeColor = isDark ? theme.textGreen : colors.primary[700];
  const activeBackground = isDark ? colors.primary[950] : colors.primary[100];
  const scale = useSharedValue(1);
  const activeProgress = useSharedValue(isActive ? 1 : 0);

  activeProgress.value = withSpring(isActive ? 1 : 0, {
    damping: 15,
    stiffness: 150,
  });

  const animatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      activeProgress.value,
      [0, 1],
      ['transparent', activeBackground]
    );

    return {
      backgroundColor,
      transform: [{ scale: scale.value }],
    };
  });

  const handlePressIn = () => {
    if (!disabled) {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value API
      scale.value = withSpring(0.96, { damping: 15 });
    }
  };

  const handlePressOut = () => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value API
    scale.value = withSpring(1, { damping: 15 });
  };

  return (
    <AnimatedPressable
      style={[styles.pill, animatedStyle, disabled && styles.disabled]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={18} color={isActive ? activeColor : theme.textSecondary} />
      <Text style={[styles.label, { color: isActive ? activeColor : theme.textSecondary }]}>
        {label}
      </Text>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      {showChevron && isActive && (
        <Ionicons name="chevron-down" size={14} color={activeColor} style={styles.chevron} />
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    gap: spacing.xxsmall,
    minHeight: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  chevron: {
    marginLeft: 2,
  },
  disabled: {
    opacity: 0.5,
  },
});
