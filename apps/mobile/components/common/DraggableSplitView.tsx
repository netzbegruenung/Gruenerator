/**
 * DraggableSplitView Component
 * A vertically split container with a draggable divider
 * Uses gesture-handler + reanimated for 60fps native performance
 */

import { type ReactNode } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { colors, spacing } from '../../theme';

interface DraggableSplitViewProps {
  /** Content for the top section (e.g., video preview) */
  topContent: ReactNode;
  /** Content for the bottom section (e.g., subtitle list) */
  bottomContent: ReactNode;
  /** Initial ratio for top section (0.0 - 1.0), default 0.4 */
  initialRatio?: number;
  /** Minimum ratio for top section, default 0.2 */
  minTopRatio?: number;
  /** Maximum ratio for top section, default 0.7 */
  maxTopRatio?: number;
  /** Total available height (excluding header/toolbar) */
  containerHeight: number;
  /** Callback when ratio changes (for persistence) */
  onRatioChange?: (ratio: number) => void;
  /** Height of the draggable divider, default 32 */
  dividerHeight?: number;
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 300,
  mass: 0.5,
};

export function DraggableSplitView({
  topContent,
  bottomContent,
  initialRatio = 0.4,
  minTopRatio = 0.2,
  maxTopRatio = 0.7,
  containerHeight,
  onRatioChange,
  dividerHeight = 32,
}: DraggableSplitViewProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const usableHeight = containerHeight - dividerHeight;
  const ratio = useSharedValue(initialRatio);
  const startRatio = useSharedValue(initialRatio);

  const notifyRatioChange = (newRatio: number) => {
    onRatioChange?.(newRatio);
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startRatio.value = ratio.value;
    })
    .onUpdate((event) => {
      const deltaRatio = event.translationY / usableHeight;
      const newRatio = Math.max(minTopRatio, Math.min(maxTopRatio, startRatio.value + deltaRatio));
      ratio.value = newRatio;
    })
    .onEnd(() => {
      ratio.value = withSpring(ratio.value, SPRING_CONFIG);
      runOnJS(notifyRatioChange)(ratio.value);
    });

  const topStyle = useAnimatedStyle(() => ({
    height: usableHeight * ratio.value,
  }));

  const bottomStyle = useAnimatedStyle(() => ({
    height: usableHeight * (1 - ratio.value),
  }));

  const dividerActiveStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.section, topStyle]}>{topContent}</Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.divider,
            { height: dividerHeight },
            isDark ? styles.dividerDark : styles.dividerLight,
            dividerActiveStyle,
          ]}
        >
          <View style={[styles.handle, isDark ? styles.handleDark : styles.handleLight]} />
        </Animated.View>
      </GestureDetector>

      <Animated.View style={[styles.section, bottomStyle]}>{bottomContent}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    overflow: 'hidden',
  },
  divider: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xsmall,
  },
  dividerLight: {
    backgroundColor: colors.grey[100],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.grey[200],
  },
  dividerDark: {
    backgroundColor: colors.grey[800],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.grey[700],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  handleLight: {
    backgroundColor: colors.grey[400],
  },
  handleDark: {
    backgroundColor: colors.grey[500],
  },
});
