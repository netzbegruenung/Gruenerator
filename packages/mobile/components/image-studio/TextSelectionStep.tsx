/**
 * TextSelectionStep Component
 * Generated text display with alternative selection
 */

import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ImageStudioTemplateType, NormalizedTextResult, ImageStudioFormData } from '@gruenerator/shared/image-studio';
import { getTypeConfig, getFieldConfig } from '@gruenerator/shared/image-studio';
import { Button } from '../common';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface TextSelectionStepProps {
  type: ImageStudioTemplateType;
  generatedText: NormalizedTextResult | null;
  formData: ImageStudioFormData;
  selectedAlternativeIndex: number;
  loading: boolean;
  error: string | null;
  onSelectAlternative: (index: number) => void;
  onApplyAlternative: () => void;
  onNext: () => void;
  onBack: () => void;
  onRetry?: () => void;
}

export function TextSelectionStep({
  type,
  generatedText,
  formData,
  selectedAlternativeIndex,
  loading,
  error,
  onSelectAlternative,
  onApplyAlternative,
  onNext,
  onBack,
  onRetry,
}: TextSelectionStepProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const typeConfig = getTypeConfig(type);
  const fieldConfig = getFieldConfig(type);

  const handleSelectAndApply = (index: number) => {
    onSelectAlternative(index);
    // Slight delay to show selection before applying
    setTimeout(() => {
      onApplyAlternative();
    }, 100);
  };

  const renderTextPreview = (fields: Record<string, string | number>, isSelected: boolean, index: number) => {
    const previewFields = fieldConfig?.previewFields || [];

    return (
      <Pressable
        onPress={() => handleSelectAndApply(index)}
        style={[
          styles.textCard,
          {
            backgroundColor: isDark ? colors.grey[900] : colors.white,
            borderColor: isSelected
              ? colors.primary[600]
              : isDark
              ? colors.grey[800]
              : colors.grey[200],
            borderWidth: isSelected ? 2 : 1,
          },
        ]}
      >
        {isSelected && (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={colors.white} />
            <Text style={styles.selectedBadgeText}>Ausgewählt</Text>
          </View>
        )}

        {previewFields.map((field) => {
          const value = fields[field.name];
          if (value === undefined || value === null || value === '') return null;

          return (
            <View key={field.name} style={styles.fieldPreview}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{field.label}</Text>
              <Text style={[styles.fieldValue, { color: theme.text }]} numberOfLines={3}>
                {String(value)}
              </Text>
            </View>
          );
        })}
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary[600]} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          Texte werden generiert...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.error[500]} />
        <Text style={[styles.errorTitle, { color: theme.text }]}>Fehler</Text>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>{error}</Text>
        {onRetry && (
          <Button onPress={onRetry} variant="primary" style={styles.retryButton}>
            Erneut versuchen
          </Button>
        )}
        <Pressable onPress={onBack} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colors.primary[600] }]}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  if (!generatedText) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
          Keine generierten Texte verfügbar
        </Text>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: colors.primary[600] }]}>Zurück</Text>
        </Pressable>
      </View>
    );
  }

  const hasAlternatives = generatedText.alternatives.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>
          {hasAlternatives ? 'Variante wählen' : 'Generierter Text'}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {hasAlternatives
            ? 'Tippe auf eine Variante, um sie auszuwählen'
            : 'Du kannst den Text später noch bearbeiten'}
        </Text>
      </View>

      {/* Main result */}
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Vorschlag</Text>
      {renderTextPreview(formData, selectedAlternativeIndex === 0, 0)}

      {/* Alternatives */}
      {hasAlternatives && (
        <>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            {fieldConfig?.alternativesButtonText || 'Alternativen'}
          </Text>
          {generatedText.alternatives.map((alt, index) => (
            <View key={index}>
              {renderTextPreview(alt, selectedAlternativeIndex === index + 1, index + 1)}
            </View>
          ))}
        </>
      )}

      <View style={styles.buttonContainer}>
        <Button onPress={onNext} variant="primary">
          Bild generieren
        </Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.medium,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.large,
  },
  header: {
    marginBottom: spacing.small,
  },
  title: {
    ...typography.h3,
    marginBottom: spacing.xxsmall,
  },
  description: {
    ...typography.body,
  },
  buttonContainer: {
    marginTop: spacing.large,
    marginBottom: spacing.medium,
  },
  sectionTitle: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.medium,
    marginBottom: spacing.small,
  },
  textCard: {
    borderRadius: borderRadius.large,
    padding: spacing.medium,
    marginBottom: spacing.small,
    position: 'relative',
  },
  selectedBadge: {
    position: 'absolute',
    top: -8,
    right: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary[600],
    paddingVertical: 2,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
  },
  selectedBadgeText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  fieldPreview: {
    marginBottom: spacing.small,
  },
  fieldLabel: {
    ...typography.caption,
    marginBottom: 2,
  },
  fieldValue: {
    ...typography.body,
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
  errorTitle: {
    ...typography.h4,
    marginTop: spacing.medium,
    marginBottom: spacing.xsmall,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.large,
  },
  retryButton: {
    marginBottom: spacing.medium,
  },
  backLink: {
    padding: spacing.small,
  },
  backLinkText: {
    ...typography.body,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
  },
});
