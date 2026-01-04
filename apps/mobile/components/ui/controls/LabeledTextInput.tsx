/**
 * LabeledTextInput - Text input with label
 * Reusable component for labeled text input fields
 */

import { View, Text, TextInput, StyleSheet, useColorScheme, type KeyboardTypeOptions } from 'react-native';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../../theme';

interface LabeledTextInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
}

export function LabeledTextInput({
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  maxLength,
  keyboardType = 'default',
  autoCapitalize = 'none',
  returnKeyType = 'done',
}: LabeledTextInputProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      )}

      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        editable={!disabled}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        returnKeyType={returnKeyType}
        maxLength={maxLength}
        style={[
          styles.input,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          },
          disabled && styles.disabled,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xsmall,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    ...typography.body,
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.5,
  },
});
