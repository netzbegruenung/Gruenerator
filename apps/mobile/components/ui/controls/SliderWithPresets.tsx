/**
 * SliderWithPresets - Preset buttons with optional slider for fine-tuning
 * Reusable component for numeric value selection with presets
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Slider } from '../../common/editor-toolbar';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';
import { PresetButtonRow, type PresetOption } from './PresetButtonRow';

interface SliderWithPresetsProps {
  value: number;
  onChange: (value: number) => void;
  presets: PresetOption<number>[];
  min: number;
  max: number;
  step?: number;
  label?: string;
  valueFormatter?: (value: number) => string;
  disabled?: boolean;
  showSliderToggle?: boolean;
}

export function SliderWithPresets({
  value,
  onChange,
  presets,
  min,
  max,
  step = 1,
  label,
  valueFormatter = (v) => `${v}px`,
  disabled = false,
  showSliderToggle = true,
}: SliderWithPresetsProps) {
  const [showSlider, setShowSlider] = useState(false);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const isPresetSelected = presets.some((p) => p.value === value);

  const renderSliderToggle = () => {
    if (!showSliderToggle) return null;

    return (
      <Pressable
        onPress={() => setShowSlider(!showSlider)}
        disabled={disabled}
        style={[
          styles.gearButton,
          {
            backgroundColor: showSlider || !isPresetSelected ? colors.primary[600] : 'transparent',
            borderColor: showSlider || !isPresetSelected ? colors.primary[600] : theme.border,
          },
          disabled && styles.disabled,
        ]}
      >
        <Ionicons
          name="settings-outline"
          size={18}
          color={showSlider || !isPresetSelected ? colors.white : theme.text}
        />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      )}

      <View style={styles.controlRow}>
        <PresetButtonRow
          options={presets}
          value={value}
          onChange={onChange}
          disabled={disabled}
          renderExtra={renderSliderToggle}
        />

        <View style={[styles.valueDisplay, { backgroundColor: theme.surface }]}>
          <Text style={[styles.valueText, { color: theme.text }]}>
            {valueFormatter(value)}
          </Text>
        </View>
      </View>

      {showSlider && (
        <View style={styles.sliderContainer}>
          <Slider
            value={value}
            min={min}
            max={max}
            step={step}
            onValueChange={onChange}
            showValue={false}
            disabled={disabled}
          />
        </View>
      )}
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
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.medium,
  },
  gearButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueDisplay: {
    paddingVertical: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    borderRadius: 8,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  sliderContainer: {
    marginTop: spacing.xsmall,
  },
  disabled: {
    opacity: 0.5,
  },
});
