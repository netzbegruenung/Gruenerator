import { View, Text, TextInput as RNTextInput, StyleSheet, useColorScheme } from 'react-native';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { MODIFICATION_LABELS } from '@gruenerator/shared/image-studio';

interface CreditInputProps {
  credit: string;
  onCreditChange: (credit: string) => void;
  disabled?: boolean;
}

export function CreditInput({
  credit,
  onCreditChange,
  disabled = false,
}: CreditInputProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.text }]}>
        {MODIFICATION_LABELS.CREDIT}
      </Text>

      <RNTextInput
        value={credit}
        onChangeText={onCreditChange}
        placeholder={MODIFICATION_LABELS.CREDIT_PLACEHOLDER}
        placeholderTextColor={theme.textSecondary}
        editable={!disabled}
        autoCapitalize="none"
        keyboardType="url"
        returnKeyType="done"
        maxLength={50}
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
