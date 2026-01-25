/**
 * KiInputStep Component
 * Input form for KI image generation (pure-create, green-edit, universal-edit)
 */

import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  ImageStudioKiType,
  KiStyleVariant,
  GreenEditInfrastructure,
} from '@gruenerator/shared/image-studio';
import { getKiTypeConfig } from '@gruenerator/shared/image-studio';
import { Button } from '../common';
import { VariantSelector } from './VariantSelector';
import { InfrastructureSelector } from './InfrastructureSelector';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface KiInputStepProps {
  kiType: ImageStudioKiType;
  instruction: string;
  variant: KiStyleVariant;
  infrastructureOptions: GreenEditInfrastructure[];
  uploadedImageUri: string | null;
  onInstructionChange: (instruction: string) => void;
  onVariantChange: (variant: KiStyleVariant) => void;
  onInfrastructureToggle: (option: GreenEditInfrastructure) => void;
  onNext: () => void;
  onBack: () => void;
}

const MIN_INSTRUCTION_LENGTH: Record<ImageStudioKiType, number> = {
  'pure-create': 5,
  'green-edit': 15,
  'universal-edit': 15,
};

const PLACEHOLDERS: Record<ImageStudioKiType, string> = {
  'pure-create': 'Beschreibe das Bild, das du erstellen möchtest...',
  'green-edit': 'Beschreibe, wie die Straße transformiert werden soll...',
  'universal-edit': 'Beschreibe die gewünschten Änderungen am Bild...',
};

const HINTS: Record<ImageStudioKiType, string> = {
  'pure-create': 'Je detaillierter deine Beschreibung, desto besser das Ergebnis.',
  'green-edit': 'Z.B. "Verwandle die Straße in eine grüne Oase mit Bäumen und Radwegen"',
  'universal-edit': 'Z.B. "Ersetze den Himmel durch einen Sonnenuntergang"',
};

export function KiInputStep({
  kiType,
  instruction,
  variant,
  infrastructureOptions,
  uploadedImageUri,
  onInstructionChange,
  onVariantChange,
  onInfrastructureToggle,
  onNext,
  onBack,
}: KiInputStepProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const typeConfig = getKiTypeConfig(kiType);
  const minLength = MIN_INSTRUCTION_LENGTH[kiType];
  const isValid = instruction.length >= minLength;

  const isPureCreate = kiType === 'pure-create';
  const isGreenEdit = kiType === 'green-edit';

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
          <View style={styles.headerRow}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
              ]}
            >
              <Ionicons
                name={
                  isPureCreate
                    ? 'color-wand-outline'
                    : isGreenEdit
                      ? 'leaf-outline'
                      : 'brush-outline'
                }
                size={24}
                color={colors.primary[500]}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.text }]}>{typeConfig?.label}</Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {typeConfig?.description}
              </Text>
            </View>
          </View>
        </View>

        {uploadedImageUri && !isPureCreate && (
          <View style={styles.imagePreview}>
            <Image
              source={{ uri: uploadedImageUri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            <View
              style={[
                styles.imageLabel,
                { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] },
              ]}
            >
              <Ionicons name="image-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.imageLabelText, { color: theme.textSecondary }]}>
                Ausgangsbild
              </Text>
            </View>
          </View>
        )}

        {isPureCreate && (
          <View style={styles.section}>
            <VariantSelector selected={variant} onSelect={onVariantChange} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>
            {isPureCreate ? 'Beschreibung' : 'Anweisung'}
          </Text>
          <TextInput
            style={[
              styles.textInput,
              {
                backgroundColor: isDark ? colors.grey[900] : colors.white,
                borderColor: isDark ? colors.grey[700] : colors.grey[300],
                color: theme.text,
              },
            ]}
            value={instruction}
            onChangeText={onInstructionChange}
            placeholder={PLACEHOLDERS[kiType]}
            placeholderTextColor={isDark ? colors.grey[500] : colors.grey[400]}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <View style={styles.inputFooter}>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>{HINTS[kiType]}</Text>
            <Text
              style={[
                styles.charCount,
                { color: isValid ? theme.textSecondary : colors.error[500] },
              ]}
            >
              {instruction.length} / {minLength}+
            </Text>
          </View>
        </View>

        {isGreenEdit && (
          <View style={styles.section}>
            <InfrastructureSelector
              selected={infrastructureOptions}
              onToggle={onInfrastructureToggle}
            />
          </View>
        )}

        <View
          style={[
            styles.rateLimitNote,
            { backgroundColor: isDark ? colors.grey[800] : colors.grey[100] },
          ]}
        >
          <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.rateLimitText, { color: theme.textSecondary }]}>
            Die KI-Bildgenerierung kann einige Sekunden dauern. Bei hoher Auslastung kann es zu
            Wartezeiten kommen.
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          <Button onPress={onNext} variant="primary" disabled={!isValid}>
            Bild generieren
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
  imagePreview: {
    marginBottom: spacing.large,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 150,
  },
  imageLabel: {
    position: 'absolute',
    bottom: spacing.small,
    left: spacing.small,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.small,
  },
  imageLabelText: {
    ...typography.caption,
    fontWeight: '500',
  },
  section: {
    marginBottom: spacing.large,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.small,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    minHeight: 120,
    ...typography.body,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: spacing.xsmall,
  },
  hint: {
    ...typography.caption,
    flex: 1,
    marginRight: spacing.small,
  },
  charCount: {
    ...typography.caption,
  },
  rateLimitNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.medium,
    marginBottom: spacing.medium,
  },
  rateLimitText: {
    ...typography.caption,
    flex: 1,
  },
  buttonContainer: {
    alignItems: 'flex-end',
    paddingBottom: spacing.large,
  },
});
