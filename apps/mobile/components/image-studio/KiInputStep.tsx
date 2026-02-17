/**
 * KiInputStep Component
 * Input form for KI image generation (pure-create, green-edit, universal-edit)
 */

import { Ionicons } from '@expo/vector-icons';
import { getKiTypeConfig } from '@gruenerator/shared/image-studio';
import { View, Text, TextInput, StyleSheet, useColorScheme, Image } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useSpeechToText, appendTranscript } from '../../hooks/useSpeechToText';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';
import { Button, MicButton } from '../common';

import { InfrastructureSelector } from './InfrastructureSelector';
import { VariantSelector } from './VariantSelector';

import type {
  ImageStudioKiType,
  KiStyleVariant,
  GreenEditInfrastructure,
} from '@gruenerator/shared/image-studio';

interface KiInputStepProps {
  kiType: ImageStudioKiType;
  instruction: string;
  variant: KiStyleVariant;
  infrastructureOptions: GreenEditInfrastructure[];
  uploadedImageUri: string | null;
  variantPreSelected?: boolean;
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
  variantPreSelected,
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
  const { isListening, toggle: toggleSpeech } = useSpeechToText();

  const isPureCreate = kiType === 'pure-create';
  const isGreenEdit = kiType === 'green-edit';

  return (
    <KeyboardAwareScrollView
      style={styles.scrollView}
      contentContainerStyle={isPureCreate ? styles.scrollContentCentered : styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.header, isPureCreate && styles.headerCentered]}>
        {isPureCreate ? (
          <>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
              ]}
            >
              <Ionicons name="color-wand-outline" size={24} color={colors.primary[500]} />
            </View>
            <Text style={[styles.title, styles.titleCentered, { color: theme.text }]}>
              {typeConfig?.label}
            </Text>
            <Text
              style={[styles.subtitle, styles.subtitleCentered, { color: theme.textSecondary }]}
            >
              {typeConfig?.description}
            </Text>
          </>
        ) : (
          <View style={styles.headerRow}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: isDark ? colors.primary[900] : colors.primary[100] },
              ]}
            >
              <Ionicons
                name={isGreenEdit ? 'leaf-outline' : 'brush-outline'}
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
        )}
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

      {isPureCreate && !variantPreSelected && (
        <View style={styles.section}>
          <VariantSelector selected={variant} onSelect={onVariantChange} />
        </View>
      )}

      <View style={styles.section}>
        {!isPureCreate && <Text style={[styles.label, { color: theme.text }]}>Anweisung</Text>}
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
          {!isPureCreate ? (
            <Text style={[styles.hint, { color: theme.textSecondary }]}>{HINTS[kiType]}</Text>
          ) : (
            <View />
          )}
          <View style={styles.inputFooterRight}>
            <MicButton
              isListening={isListening}
              onMicPress={() =>
                toggleSpeech((t) => onInstructionChange(appendTranscript(instruction, t)))
              }
              hasText={isValid}
              onSubmit={onNext}
            />
            {!isPureCreate && (
              <Text
                style={[
                  styles.charCount,
                  { color: isValid ? theme.textSecondary : colors.error[500] },
                ]}
              >
                {instruction.length} / {minLength}+
              </Text>
            )}
          </View>
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

      {!isPureCreate && (
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
      )}

      <View style={[styles.buttonContainer, isPureCreate && styles.buttonContainerCentered]}>
        <Button onPress={onNext} variant="primary" disabled={!isValid}>
          Bild generieren
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
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.medium,
    paddingHorizontal: spacing.xlarge,
  },
  header: {
    marginBottom: spacing.large,
  },
  headerCentered: {
    alignItems: 'center',
    marginBottom: spacing.xlarge,
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
  titleCentered: {
    textAlign: 'center',
    marginTop: spacing.medium,
  },
  subtitle: {
    ...typography.body,
  },
  subtitleCentered: {
    textAlign: 'center',
    marginTop: spacing.xxsmall,
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
    alignItems: 'center',
    marginTop: spacing.xsmall,
  },
  inputFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
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
  buttonContainerCentered: {
    alignItems: 'center',
  },
});
