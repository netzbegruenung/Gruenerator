/**
 * CrossPad - 2D directional control pad
 * Reusable component for adjusting X/Y offset values
 */

import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

export type Offset2D = [number, number];
type Direction = 'up' | 'down' | 'left' | 'right';

interface CrossPadProps {
  offset: Offset2D;
  onChange: (offset: Offset2D) => void;
  step?: number;
  label?: string;
  description?: string;
  valueFormatter?: (offset: Offset2D) => string;
  disabled?: boolean;
}

export function CrossPad({
  offset,
  onChange,
  step = 10,
  label,
  description,
  valueFormatter = ([x, y]) => `${x},${y}`,
  disabled = false,
}: CrossPadProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleMove = (direction: Direction) => {
    if (disabled) return;

    const [x, y] = offset;
    let newOffset: Offset2D;

    switch (direction) {
      case 'up':
        newOffset = [x, y - step];
        break;
      case 'down':
        newOffset = [x, y + step];
        break;
      case 'left':
        newOffset = [x - step, y];
        break;
      case 'right':
        newOffset = [x + step, y];
        break;
    }

    onChange(newOffset);
  };

  const ArrowButton = ({
    direction,
    icon,
  }: {
    direction: Direction;
    icon: keyof typeof Ionicons.glyphMap;
  }) => (
    <Pressable
      onPress={() => handleMove(direction)}
      disabled={disabled}
      style={[
        styles.arrowButton,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        disabled && styles.disabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={disabled ? theme.textSecondary : colors.primary[600]}
      />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
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
              {valueFormatter(offset)}
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
  label: {
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
