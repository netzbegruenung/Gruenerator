/**
 * ColorOptionGrid - Grid of color scheme options
 * Reusable component for selecting from color presets
 */

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { View, Text, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { colors, spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../../theme';

export interface ColorOption<T extends string = string> {
  id: T;
  colors: { background: string }[];
  /** Readable name announced by screen readers; falls back to the option's position. */
  name?: string;
}

interface ColorOptionGridProps<T extends string = string> {
  options: ColorOption<T>[];
  value: T | null;
  onChange: (id: T) => void;
  label?: string;
  disabled?: boolean;
  maxWidth?: number;
}

export function ColorOptionGrid<T extends string = string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  maxWidth = 72,
}: ColorOptionGridProps<T>) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, { color: theme.text }]}>{label}</Text>}

      <View style={styles.optionsRow}>
        {options.map((option, index) => {
          const isActive = value === option.id;

          return (
            <Pressable
              key={option.id}
              onPress={() => onChange(option.id)}
              disabled={disabled}
              style={[
                styles.optionButton,
                {
                  borderColor: isActive ? colors.primary[600] : theme.border,
                  borderWidth: isActive ? 2 : 1,
                  maxWidth,
                },
                disabled && styles.disabled,
              ]}
              accessibilityRole="radio"
              accessibilityLabel={option.name ?? `Farbschema ${index + 1}`}
              accessibilityState={{ checked: isActive, disabled }}
            >
              <View style={styles.colorPreview}>
                {option.colors.map((color, index) => (
                  <View
                    key={index}
                    style={[styles.colorBar, { backgroundColor: color.background }]}
                  />
                ))}
              </View>
              {isActive && (
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.primary[600]} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.small,
  },
  label: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.small,
  },
  optionButton: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    position: 'relative',
  },
  colorPreview: {
    flex: 1,
    flexDirection: 'column',
  },
  colorBar: {
    flex: 1,
  },
  checkmark: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.white,
    borderRadius: 10,
  },
  disabled: {
    opacity: 0.5,
  },
});
