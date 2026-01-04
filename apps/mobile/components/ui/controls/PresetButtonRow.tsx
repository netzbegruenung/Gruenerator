/**
 * PresetButtonRow - Generic row of preset buttons
 * Reusable component for selecting from predefined options
 */

import { View, Text, Pressable, StyleSheet, useColorScheme, type ViewStyle } from 'react-native';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';

export interface PresetOption<T> {
  label: string;
  value: T;
}

interface PresetButtonRowProps<T> {
  options: PresetOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  compareValues?: (a: T, b: T) => boolean;
  buttonStyle?: ViewStyle;
  renderExtra?: () => React.ReactNode;
}

export function PresetButtonRow<T>({
  options,
  value,
  onChange,
  disabled = false,
  compareValues = (a, b) => a === b,
  buttonStyle,
  renderExtra,
}: PresetButtonRowProps<T>) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      {options.map((option, index) => {
        const isActive = compareValues(value, option.value);
        return (
          <Pressable
            key={index}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            style={[
              styles.button,
              {
                backgroundColor: isActive ? colors.primary[600] : 'transparent',
                borderColor: isActive ? colors.primary[600] : theme.border,
              },
              buttonStyle,
              disabled && styles.disabled,
            ]}
          >
            <Text
              style={[
                styles.buttonText,
                { color: isActive ? colors.white : theme.text },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
      {renderExtra?.()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.xsmall,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
