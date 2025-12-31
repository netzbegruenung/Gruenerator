import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Slider } from '../common/editor-toolbar';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';
import {
  FONT_SIZE_OPTIONS,
  ZITAT_FONT_SIZE_OPTIONS,
  MODIFICATION_CONTROLS_CONFIG,
  MODIFICATION_LABELS,
  type FontSizeOption,
} from '@gruenerator/shared/image-studio';

interface FontSizeControlProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  isZitatType?: boolean;
  disabled?: boolean;
}

export function FontSizeControl({
  fontSize,
  onFontSizeChange,
  isZitatType = false,
  disabled = false,
}: FontSizeControlProps) {
  const [showSlider, setShowSlider] = useState(false);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const options: FontSizeOption[] = isZitatType ? ZITAT_FONT_SIZE_OPTIONS : FONT_SIZE_OPTIONS;
  const config = isZitatType
    ? MODIFICATION_CONTROLS_CONFIG.fontSize.zitat
    : MODIFICATION_CONTROLS_CONFIG.fontSize.standard;

  const isPresetSelected = options.some(opt => opt.value === fontSize);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>
        {MODIFICATION_LABELS.FONT_SIZE}
      </Text>

      <View style={styles.controlRow}>
        <View style={styles.buttonsRow}>
          {options.map((option) => {
            const isActive = fontSize === option.value;
            return (
              <Pressable
                key={option.label}
                onPress={() => onFontSizeChange(option.value)}
                disabled={disabled}
                style={[
                  styles.sizeButton,
                  {
                    backgroundColor: isActive ? colors.primary[600] : 'transparent',
                    borderColor: isActive ? colors.primary[600] : theme.border,
                  },
                  disabled && styles.disabled,
                ]}
              >
                <Text
                  style={[
                    styles.sizeButtonText,
                    { color: isActive ? colors.white : theme.text },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}

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
        </View>

        <View style={[styles.valueDisplay, { backgroundColor: theme.surface }]}>
          <Text style={[styles.valueText, { color: theme.text }]}>
            {fontSize}px
          </Text>
        </View>
      </View>

      {showSlider && (
        <View style={styles.sliderContainer}>
          <Slider
            value={fontSize}
            min={config.min}
            max={config.max}
            step={config.step}
            onValueChange={onFontSizeChange}
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
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  sizeButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeButtonText: {
    fontSize: 14,
    fontWeight: '600',
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
