import { View, Text, TextInput as RNTextInput, StyleSheet, TextInputProps, useColorScheme } from 'react-native';
import { colors, typography, spacing, borderRadius, lightTheme, darkTheme } from '../../theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  multiline?: boolean;
  numberOfLines?: number;
}

export function TextInput({
  label,
  error,
  multiline = false,
  numberOfLines = 1,
  style,
  ...props
}: Props) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      )}
      <RNTextInput
        style={[
          styles.input,
          {
            backgroundColor: theme.surface,
            color: theme.text,
            borderColor: error ? colors.semantic.error : theme.border,
          },
          multiline && {
            minHeight: numberOfLines * 24 + spacing.medium * 2,
            textAlignVertical: 'top',
            borderRadius: borderRadius.large,
            borderWidth: 1,
            paddingVertical: spacing.medium,
          },
          style,
        ]}
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        numberOfLines={multiline ? numberOfLines : 1}
        {...props}
      />
      {error && (
        <Text style={styles.error}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.medium,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.xsmall,
  },
  input: {
    ...typography.body,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.pill,
    borderWidth: 0.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  error: {
    ...typography.caption,
    color: colors.semantic.error,
    marginTop: spacing.xsmall,
  },
});
