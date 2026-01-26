/**
 * ExpandablePanel Component
 * Animated container for tool options with smooth height transitions
 */

import { useState, useCallback, type ReactNode } from 'react';
import { View, StyleSheet, LayoutChangeEvent, useColorScheme } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { spacing, lightTheme, darkTheme } from '../../../theme';

export interface ExpandablePanelProps {
  isExpanded: boolean;
  children: ReactNode;
  maxHeight?: number;
  showBorder?: boolean;
}

export function ExpandablePanel({
  isExpanded,
  children,
  maxHeight = 200,
  showBorder = true,
}: ExpandablePanelProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const [contentHeight, setContentHeight] = useState(0);
  const animatedHeight = useSharedValue(0);
  const animatedOpacity = useSharedValue(0);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      if (height > 0 && height !== contentHeight) {
        setContentHeight(Math.min(height, maxHeight));
      }
    },
    [contentHeight, maxHeight]
  );

  const targetHeight = isExpanded ? contentHeight : 0;

  animatedHeight.value = withSpring(targetHeight, {
    damping: 18,
    stiffness: 120,
    mass: 0.8,
  });

  animatedOpacity.value = withTiming(isExpanded ? 1 : 0, {
    duration: isExpanded ? 200 : 100,
  });

  const animatedContainerStyle = useAnimatedStyle(() => ({
    height: animatedHeight.value,
    opacity: animatedOpacity.value,
    overflow: 'hidden',
  }));

  return (
    <Animated.View style={[styles.container, animatedContainerStyle]}>
      <View
        style={[styles.content, showBorder && { borderTopColor: theme.border, borderTopWidth: 1 }]}
        onLayout={handleLayout}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
  },
});
