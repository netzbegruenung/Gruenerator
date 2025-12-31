/**
 * CrossControl Component
 * 2D directional control for X/Y positioning
 */

import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

export type Offset2D = [number, number];

export interface CrossControlProps {
  title?: string;
  description?: string;
  offset: Offset2D;
  onOffsetChange: (offset: Offset2D) => void;
  step?: number;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  disabled?: boolean;
  formatValue?: (x: number, y: number) => string;
}

type Direction = 'up' | 'down' | 'left' | 'right';

export function CrossControl({
  title,
  description,
  offset,
  onOffsetChange,
  step = 10,
  minX = -Infinity,
  maxX = Infinity,
  minY = -Infinity,
  maxY = Infinity,
  disabled = false,
  formatValue = (x, y) => `${x},${y}`,
}: CrossControlProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleMove = (direction: Direction) => {
    if (disabled) return;

    const [x, y] = offset;
    let newX = x;
    let newY = y;

    switch (direction) {
      case 'up':
        newY = Math.max(minY, y - step);
        break;
      case 'down':
        newY = Math.min(maxY, y + step);
        break;
      case 'left':
        newX = Math.max(minX, x - step);
        break;
      case 'right':
        newX = Math.min(maxX, x + step);
        break;
    }

    onOffsetChange([newX, newY]);
  };

  const canMove = {
    up: offset[1] > minY,
    down: offset[1] < maxY,
    left: offset[0] > minX,
    right: offset[0] < maxX,
  };

  const ArrowButton = ({
    direction,
    icon,
  }: {
    direction: Direction;
    icon: keyof typeof Ionicons.glyphMap;
  }) => {
    const isDisabled = disabled || !canMove[direction];

    return (
      <Pressable
        onPress={() => handleMove(direction)}
        disabled={isDisabled}
        style={[
          styles.arrowButton,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
          isDisabled && styles.disabled,
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={isDisabled ? theme.textSecondary : colors.primary[600]}
        />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {title && (
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      )}
      {description && (
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {description}
        </Text>
      )}

      <View style={styles.crossGrid}>
        <View style={styles.topRow}>
          <ArrowButton direction="up" icon="chevron-up" />
        </View>

        <View style={styles.middleRow}>
          <ArrowButton direction="left" icon="chevron-back" />

          <View style={[styles.centerDisplay, { backgroundColor: theme.surface }]}>
            <Text style={[styles.centerText, { color: theme.text }]}>
              {formatValue(offset[0], offset[1])}
            </Text>
          </View>

          <ArrowButton direction="right" icon="chevron-forward" />
        </View>

        <View style={styles.bottomRow}>
          <ArrowButton direction="down" icon="chevron-down" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 12,
  },
  crossGrid: {
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.small,
  },
  topRow: {
    alignItems: 'center',
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  bottomRow: {
    alignItems: 'center',
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerDisplay: {
    width: 64,
    height: 44,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  disabled: {
    opacity: 0.5,
  },
});
