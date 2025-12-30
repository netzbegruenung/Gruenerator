/**
 * InputStep Component
 * Dynamic form rendering based on field configuration
 */

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImageStudioTemplateType, InputFieldConfig } from '@gruenerator/shared/image-studio';
import { getInputFields, getTypeConfig, validateField } from '@gruenerator/shared/image-studio';
import { Button } from '../common';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface InputStepProps {
  type: ImageStudioTemplateType;
  formData: Record<string, any>;
  onUpdateField: (name: string, value: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export function InputStep({ type, formData, onUpdateField, onNext, onBack }: InputStepProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const [errors, setErrors] = useState<Record<string, string>>({});

  const inputFields = getInputFields(type);
  const typeConfig = getTypeConfig(type);

  const handleNext = () => {
    const newErrors: Record<string, string> = {};

    for (const field of inputFields) {
      const error = validateField(field, formData[field.name]);
      if (error) {
        newErrors[field.name] = error;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    onNext();
  };

  const renderField = (field: InputFieldConfig) => {
    const value = formData[field.name] || '';
    const error = errors[field.name];

    if (field.type === 'select' && field.options) {
      return (
        <View key={field.name} style={styles.fieldContainer}>
          <Text style={[styles.label, { color: theme.text }]}>{field.label}</Text>
          <View style={styles.selectContainer}>
            {field.options.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => onUpdateField(field.name, option.value)}
                style={[
                  styles.selectOption,
                  {
                    backgroundColor:
                      value === option.value
                        ? colors.primary[600]
                        : isDark
                        ? colors.grey[800]
                        : colors.grey[100],
                    borderColor:
                      value === option.value
                        ? colors.primary[600]
                        : isDark
                        ? colors.grey[700]
                        : colors.grey[300],
                  },
                ]}
              >
                <Text
                  style={[
                    styles.selectOptionText,
                    { color: value === option.value ? colors.white : theme.text },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );
    }

    const isTextarea = field.type === 'textarea';

    return (
      <View key={field.name} style={styles.fieldContainer}>
        <Text style={[styles.label, { color: theme.text }]}>{field.label}</Text>
        <TextInput
          style={[
            styles.input,
            isTextarea && styles.textarea,
            {
              backgroundColor: isDark ? colors.grey[900] : colors.white,
              borderColor: error
                ? colors.error[500]
                : isDark
                ? colors.grey[700]
                : colors.grey[300],
              color: theme.text,
            },
          ]}
          value={value}
          onChangeText={(text) => {
            onUpdateField(field.name, text);
            if (errors[field.name]) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next[field.name];
                return next;
              });
            }
          }}
          placeholder={field.placeholder}
          placeholderTextColor={isDark ? colors.grey[500] : colors.grey[400]}
          multiline={isTextarea}
          numberOfLines={field.rows || (isTextarea ? 4 : 1)}
          textAlignVertical={isTextarea ? 'top' : 'center'}
          maxLength={field.maxLength}
        />
        {field.helpText && (
          <Text style={[styles.helpText, { color: theme.textSecondary }]}>{field.helpText}</Text>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
        {field.maxLength && (
          <Text style={[styles.charCount, { color: theme.textSecondary }]}>
            {value.length} / {field.maxLength}
          </Text>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text }]}>{typeConfig?.label}</Text>
        </View>

        {inputFields.map(renderField)}

        <View style={styles.buttonContainer}>
          <Button onPress={handleNext} variant="primary">
            Weiter
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.large,
  },
  backButton: {
    padding: spacing.small,
    marginRight: spacing.small,
    marginLeft: -spacing.small,
  },
  title: {
    ...typography.h3,
  },
  fieldContainer: {
    marginBottom: spacing.large,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.small,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    ...typography.body,
  },
  textarea: {
    minHeight: 120,
    paddingTop: spacing.small,
  },
  helpText: {
    ...typography.caption,
    marginTop: spacing.xxsmall,
  },
  errorText: {
    ...typography.caption,
    color: colors.error[500],
    marginTop: spacing.xxsmall,
  },
  charCount: {
    ...typography.caption,
    textAlign: 'right',
    marginTop: spacing.xxsmall,
  },
  selectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.small,
  },
  selectOption: {
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  selectOptionText: {
    ...typography.body,
  },
  buttonContainer: {
    alignItems: 'flex-end',
    marginTop: spacing.medium,
    paddingBottom: spacing.large,
  },
});
