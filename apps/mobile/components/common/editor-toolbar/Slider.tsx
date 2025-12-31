/**
 * Slider Component
 * Generic slider with optional value display
 */

import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import RNSlider from '@react-native-community/slider';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  showValue?: boolean;
  valueFormat?: (value: number) => string;
  disabled?: boolean;
  label?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  showValue = true,
  valueFormat = (v) => `${v}`,
  disabled = false,
  label,
}: SliderProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {label}
        </Text>
      )}
      <View style={styles.sliderRow}>
        <RNSlider
          style={styles.slider}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          minimumTrackTintColor={colors.primary[600]}
          maximumTrackTintColor={colorScheme === 'dark' ? colors.grey[700] : colors.grey[300]}
          thumbTintColor={colors.primary[600]}
        />
        {showValue && (
          <View style={[styles.valueContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.valueText, { color: theme.text }]}>
              {valueFormat(value)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xsmall,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  valueContainer: {
    minWidth: 56,
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
  },
  valueText: {
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
