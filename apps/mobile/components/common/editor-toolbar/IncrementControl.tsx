/**
 * IncrementControl Component
 * 1D increment/decrement control for numerical values
 */

import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

export interface IncrementControlProps {
  label?: string;
  description?: string;
  value: number;
  onValueChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  orientation?: 'horizontal' | 'vertical';
}

export function IncrementControl({
  label,
  description,
  value,
  onValueChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  disabled = false,
  formatValue = (v) => `${v > 0 ? '+' : ''}${v}`,
  orientation = 'horizontal',
}: IncrementControlProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleChange = (direction: -1 | 1) => {
    if (disabled) return;
    const newValue = value + direction * step;
    if (newValue >= min && newValue <= max) {
      onValueChange(newValue);
    }
  };

  const canDecrement = value > min;
  const canIncrement = value < max;

  const Button = ({
    direction,
    icon,
    canPress,
  }: {
    direction: -1 | 1;
    icon: keyof typeof Ionicons.glyphMap;
    canPress: boolean;
  }) => {
    const isDisabled = disabled || !canPress;

    return (
      <Pressable
        onPress={() => handleChange(direction)}
        disabled={isDisabled}
        style={[
          styles.button,
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

  const isHorizontal = orientation === 'horizontal';

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

      <View style={[styles.controls, isHorizontal && styles.controlsHorizontal]}>
        <Button
          direction={-1}
          icon={isHorizontal ? 'chevron-back' : 'chevron-up'}
          canPress={canDecrement}
        />

        <View style={[styles.valueDisplay, { backgroundColor: theme.surface }]}>
          <Text style={[styles.valueText, { color: theme.text }]}>
            {formatValue(value)}
          </Text>
        </View>

        <Button
          direction={1}
          icon={isHorizontal ? 'chevron-forward' : 'chevron-down'}
          canPress={canIncrement}
        />
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
  controls: {
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  controlsHorizontal: {
    flexDirection: 'row',
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueDisplay: {
    minWidth: 56,
    height: 44,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueText: {
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  disabled: {
    opacity: 0.5,
  },
});
