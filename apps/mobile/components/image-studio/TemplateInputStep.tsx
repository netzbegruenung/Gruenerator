/**
 * TemplateInputStep Component
 * Dynamic input form for canvas editor template text generation
 */

import { Ionicons } from '@expo/vector-icons';
import {
  IMAGE_STUDIO_TYPE_CONFIGS,
  TEMPLATE_FIELD_CONFIGS,
} from '@gruenerator/shared/image-studio';
import { View, Text, TextInput, StyleSheet, useColorScheme } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { Button } from '../common';

import type {
  ImageStudioTemplateType,
  ImageStudioFormData,
} from '@gruenerator/shared/image-studio';

interface TemplateInputStepProps {
  type: ImageStudioTemplateType;
  formData: ImageStudioFormData;
  textLoading: boolean;
  error: string | null;
  onFieldChange: (name: string, value: string) => void;
  onGenerate: () => void;
  onBack: () => void;
}

const TEMPLATE_ICONS: Partial<Record<ImageStudioTemplateType, keyof typeof Ionicons.glyphMap>> = {
  dreizeilen: 'text-outline',
  zitat: 'chatbox-outline',
  'zitat-pure': 'chatbox-outline',
  info: 'information-circle-outline',
  veranstaltung: 'calendar-outline',
  simple: 'image-outline',
};

export function TemplateInputStep({
  type,
  formData,
  textLoading,
  error,
  onFieldChange,
  onGenerate,
  onBack,
}: TemplateInputStepProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const typeConfig = IMAGE_STUDIO_TYPE_CONFIGS[type];
  const fieldConfig = TEMPLATE_FIELD_CONFIGS[type];
  const inputFields = fieldConfig?.inputFields ?? [];
  const icon = TEMPLATE_ICONS[type] ?? 'document-outline';

  const isFormValid = inputFields.every((field) => {
    if (!field.required) return true;
    const value = String(formData[field.name] ?? '');
    const minLen = field.minLength ?? 1;
    return value.length >= minLen;
  });

  return (
    <KeyboardAwareScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
            ]}
          >
            <Ionicons name={icon} size={24} color={colors.primary[500]} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.text }]}>{typeConfig.label}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              {typeConfig.description}
            </Text>
          </View>
        </View>
      </View>

      {inputFields.map((field) => {
        const value = String(formData[field.name] ?? '');
        const isTextarea = field.type === 'textarea';
        const minLen = field.minLength ?? (field.required ? 1 : 0);
        const showCharCount = field.required && minLen > 1;

        return (
          <View key={field.name} style={styles.section}>
            <Text style={[styles.label, { color: theme.text }]}>
              {field.label}
              {field.required && <Text style={styles.required}> *</Text>}
            </Text>
            {field.subtitle && (
              <Text style={[styles.fieldSubtitle, { color: theme.textSecondary }]}>
                {field.subtitle}
              </Text>
            )}
            <TextInput
              style={[
                styles.textInput,
                isTextarea && styles.textArea,
                {
                  backgroundColor: isDark ? colors.grey[900] : colors.white,
                  borderColor: isDark ? colors.grey[700] : colors.grey[300],
                  color: theme.text,
                },
              ]}
              value={value}
              onChangeText={(v) => onFieldChange(field.name, v)}
              placeholder={field.placeholder}
              placeholderTextColor={isDark ? colors.grey[500] : colors.grey[400]}
              multiline={isTextarea}
              numberOfLines={isTextarea ? (field.rows ?? 4) : 1}
              textAlignVertical={isTextarea ? 'top' : 'center'}
              editable={!textLoading}
            />
            {showCharCount && (
              <Text
                style={[
                  styles.charCount,
                  {
                    color: value.length >= minLen ? theme.textSecondary : colors.error[500],
                  },
                ]}
              >
                {value.length} / {minLen}+
              </Text>
            )}
            {field.helpText && (
              <Text style={[styles.helpText, { color: theme.textSecondary }]}>
                {field.helpText}
              </Text>
            )}
          </View>
        );
      })}

      {error && (
        <View style={[styles.errorContainer, { backgroundColor: isDark ? '#3b1c1c' : '#fef2f2' }]}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.error[500]} />
          <Text style={[styles.errorText, { color: colors.error[500] }]}>{error}</Text>
        </View>
      )}

      <View style={styles.buttonRow}>
        <Button onPress={onBack} variant="secondary" disabled={textLoading}>
          Zurück
        </Button>
        <Button
          onPress={onGenerate}
          variant="primary"
          disabled={!isFormValid}
          loading={textLoading}
        >
          Grünerieren
        </Button>
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
  },
  header: {
    marginBottom: spacing.large,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary[300],
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    marginBottom: spacing.xxsmall,
  },
  subtitle: {
    ...typography.body,
  },
  section: {
    marginBottom: spacing.large,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.small,
  },
  required: {
    color: colors.error[500],
  },
  fieldSubtitle: {
    ...typography.caption,
    marginBottom: spacing.small,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    ...typography.body,
  },
  textArea: {
    minHeight: 120,
  },
  charCount: {
    ...typography.caption,
    textAlign: 'right',
    marginTop: spacing.xxsmall,
  },
  helpText: {
    ...typography.caption,
    marginTop: spacing.xxsmall,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    marginBottom: spacing.medium,
  },
  errorText: {
    ...typography.caption,
    flex: 1,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.medium,
    paddingBottom: spacing.large,
  },
});
