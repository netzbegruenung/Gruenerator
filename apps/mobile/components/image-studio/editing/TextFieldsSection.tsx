/**
 * TextFieldsSection Component
 * Renders editable text fields based on template type configuration
 */

import { View, Text, TextInput, StyleSheet, useColorScheme } from 'react-native';
import { colors, spacing, borderRadius, lightTheme, darkTheme } from '../../../theme';
import type { EditFieldConfig } from '../../../config/editSheetConfig';
import type { ImageStudioFormData, FormFieldValue } from '@gruenerator/shared/image-studio';

interface TextFieldsSectionProps {
  fields: EditFieldConfig[];
  formData: ImageStudioFormData;
  onFieldChange: (key: string, value: FormFieldValue) => void;
  disabled?: boolean;
}

export function TextFieldsSection({
  fields,
  formData,
  onFieldChange,
  disabled = false,
}: TextFieldsSectionProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Text</Text>

      {fields.map((field) => {
        const value = (formData[field.key] as string) || '';
        const isOverLimit = field.maxLength ? value.length > field.maxLength : false;

        return (
          <View key={field.key} style={styles.fieldContainer}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                {field.label}
              </Text>
              {field.maxLength && (
                <Text
                  style={[
                    styles.charCount,
                    { color: isOverLimit ? colors.error[500] : theme.textSecondary },
                  ]}
                >
                  {value.length}/{field.maxLength}
                </Text>
              )}
            </View>

            <TextInput
              style={[
                styles.input,
                field.multiline && styles.multilineInput,
                {
                  backgroundColor: theme.surface,
                  color: theme.text,
                  borderColor: isOverLimit ? colors.error[500] : theme.border,
                },
                disabled && styles.disabled,
              ]}
              value={value}
              onChangeText={(text) => onFieldChange(field.key, text)}
              placeholder={field.placeholder}
              placeholderTextColor={theme.textSecondary}
              multiline={field.multiline}
              numberOfLines={field.multiline ? 3 : 1}
              textAlignVertical={field.multiline ? 'top' : 'center'}
              editable={!disabled}
              maxLength={field.maxLength ? field.maxLength + 10 : undefined}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.medium,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xsmall,
  },
  fieldContainer: {
    gap: spacing.xsmall,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  charCount: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    fontSize: 16,
    minHeight: 48,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: spacing.small,
  },
  disabled: {
    opacity: 0.5,
  },
});
