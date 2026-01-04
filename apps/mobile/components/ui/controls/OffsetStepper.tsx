/**
 * OffsetStepper - Increment/decrement control for numeric values
 * Reusable component for adjusting values with step buttons
 */

import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

interface OffsetStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  valueFormatter?: (value: number) => string;
  disabled?: boolean;
}

export function OffsetStepper({
  value,
  onChange,
  min = -100,
  max = 100,
  step = 10,
  label,
  valueFormatter = (v) => (v > 0 ? `+${v}px` : `${v}px`),
  disabled = false,
}: OffsetStepperProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const handleChange = (direction: -1 | 1) => {
    if (disabled) return;
    const newValue = value + direction * step;
    onChange(Math.max(min, Math.min(max, newValue)));
  };

  const isAtMin = value <= min;
  const isAtMax = value >= max;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      )}

      <View style={styles.controls}>
        <Pressable
          onPress={() => handleChange(-1)}
          disabled={disabled || isAtMin}
          style={[
            styles.arrowButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            (disabled || isAtMin) && styles.buttonDisabled,
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={disabled || isAtMin ? theme.textSecondary : colors.primary[600]}
          />
        </Pressable>

        <View style={[styles.valueDisplay, { backgroundColor: theme.surface }]}>
          <Text style={[styles.valueText, { color: theme.text }]}>
            {valueFormatter(value)}
          </Text>
        </View>

        <Pressable
          onPress={() => handleChange(1)}
          disabled={disabled || isAtMax}
          style={[
            styles.arrowButton,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
            (disabled || isAtMax) && styles.buttonDisabled,
          ]}
        >
          <Ionicons
            name="chevron-forward"
            size={20}
            color={disabled || isAtMax ? theme.textSecondary : colors.primary[600]}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  valueDisplay: {
    minWidth: 64,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.small,
    alignItems: 'center',
  },
  valueText: {
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
