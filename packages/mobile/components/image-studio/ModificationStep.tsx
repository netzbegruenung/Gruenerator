/**
 * ModificationStep Component
 * Orchestrates all image modification controls with debounced preview regeneration
 */

import { useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type {
  ImageStudioTemplateType,
  DreizeilenModificationParams,
  BalkenOffset,
  Offset2D,
  DreizeilenColorScheme,
} from '@gruenerator/shared/image-studio';
import { MODIFICATION_LABELS, getTypeConfig } from '@gruenerator/shared/image-studio';
import { Button } from '../common';
import {
  FontSizeControl,
  ColorSchemeSelector,
  BalkenOffsetControl,
  BalkenGruppeControl,
  SonnenblumenControl,
  CreditInput,
} from '../image-modification';
import { useDebouncedCallback } from '../../hooks/useDebounced';
import { colors, spacing, borderRadius, lightTheme, darkTheme, typography } from '../../theme';

interface ModificationStepProps {
  type: ImageStudioTemplateType;
  generatedImage: string | null;
  modifications: DreizeilenModificationParams;
  isAdvancedMode: boolean;
  loading: boolean;
  error: string | null;
  onModificationChange: <K extends keyof DreizeilenModificationParams>(
    key: K,
    value: DreizeilenModificationParams[K]
  ) => void;
  onToggleAdvanced: () => void;
  onReset: () => void;
  onRegenerate: () => void;
  onNext: () => void;
  onBack: () => void;
}

export function ModificationStep({
  type,
  generatedImage,
  modifications,
  isAdvancedMode,
  loading,
  error,
  onModificationChange,
  onToggleAdvanced,
  onReset,
  onRegenerate,
  onNext,
  onBack,
}: ModificationStepProps) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const typeConfig = getTypeConfig(type);
  const isFirstRender = useRef(true);

  const debouncedRegenerate = useDebouncedCallback(() => {
    onRegenerate();
  }, 500);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    debouncedRegenerate();
  }, [modifications]);

  const handleFontSizeChange = useCallback(
    (value: number) => {
      onModificationChange('fontSize', value);
    },
    [onModificationChange]
  );

  const handleColorSchemeChange = useCallback(
    (scheme: DreizeilenColorScheme) => {
      onModificationChange('colorScheme', scheme);
    },
    [onModificationChange]
  );

  const handleBalkenOffsetChange = useCallback(
    (offset: BalkenOffset) => {
      onModificationChange('balkenOffset', offset);
    },
    [onModificationChange]
  );

  const handleBalkenGruppeChange = useCallback(
    (offset: Offset2D) => {
      onModificationChange('balkenGruppenOffset', offset);
    },
    [onModificationChange]
  );

  const handleSunflowerChange = useCallback(
    (offset: Offset2D) => {
      onModificationChange('sunflowerOffset', offset);
    },
    [onModificationChange]
  );

  const handleCreditChange = useCallback(
    (credit: string) => {
      onModificationChange('credit', credit);
    },
    [onModificationChange]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={colors.primary[600]} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {MODIFICATION_LABELS.TITLE}
        </Text>
        <Pressable onPress={onReset} style={styles.headerButton}>
          <Ionicons name="refresh-outline" size={22} color={colors.primary[600]} />
        </Pressable>
      </View>

      {/* Image Preview */}
      <View style={styles.previewContainer}>
        {generatedImage ? (
          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: `data:image/png;base64,${generatedImage}` }}
              style={styles.previewImage}
              contentFit="contain"
              transition={200}
            />
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.white} />
                <Text style={styles.loadingText}>
                  {MODIFICATION_LABELS.REGENERATING}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.placeholderContainer, { backgroundColor: theme.surface }]}>
            <ActivityIndicator size="large" color={colors.primary[600]} />
            <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
              Bild wird generiert...
            </Text>
          </View>
        )}
      </View>

      {/* Error Display */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={16} color={colors.error[500]} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Controls */}
      <ScrollView
        style={styles.controlsScroll}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Basic Controls */}
        <View style={styles.section}>
          <FontSizeControl
            fontSize={modifications.fontSize}
            onFontSizeChange={handleFontSizeChange}
            disabled={loading}
          />
        </View>

        <View style={styles.section}>
          <ColorSchemeSelector
            colorScheme={modifications.colorScheme}
            onColorSchemeChange={handleColorSchemeChange}
            disabled={loading}
          />
        </View>

        <View style={styles.section}>
          <CreditInput
            credit={modifications.credit}
            onCreditChange={handleCreditChange}
            disabled={loading}
          />
        </View>

        {/* Advanced Toggle */}
        <Pressable
          onPress={onToggleAdvanced}
          style={[
            styles.advancedToggle,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <View style={styles.advancedToggleContent}>
            <Ionicons
              name={isAdvancedMode ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.textSecondary}
            />
            <Text style={[styles.advancedToggleText, { color: theme.text }]}>
              {MODIFICATION_LABELS.ADVANCED_TOGGLE}
            </Text>
          </View>
        </Pressable>

        {/* Advanced Controls */}
        {isAdvancedMode && (
          <View style={styles.advancedSection}>
            <View style={styles.section}>
              <BalkenOffsetControl
                offsets={modifications.balkenOffset}
                onOffsetsChange={handleBalkenOffsetChange}
                disabled={loading}
              />
            </View>

            <View style={styles.section}>
              <BalkenGruppeControl
                offset={modifications.balkenGruppenOffset}
                onOffsetChange={handleBalkenGruppeChange}
                disabled={loading}
              />
            </View>

            <View style={styles.section}>
              <SonnenblumenControl
                offset={modifications.sunflowerOffset}
                onOffsetChange={handleSunflowerChange}
                disabled={loading}
              />
            </View>
          </View>
        )}

        {/* Continue Button */}
        <View style={styles.buttonContainer}>
          <Button
            onPress={onNext}
            variant="primary"
            disabled={loading || !generatedImage}
          >
            {MODIFICATION_LABELS.CONTINUE}
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.small,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: spacing.xsmall,
  },
  headerTitle: {
    ...typography.h4,
    flex: 1,
    textAlign: 'center',
  },
  previewContainer: {
    height: '40%',
    minHeight: 200,
    maxHeight: 300,
    padding: spacing.medium,
  },
  imageWrapper: {
    flex: 1,
    position: 'relative',
  },
  previewImage: {
    flex: 1,
    borderRadius: borderRadius.medium,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.caption,
    color: colors.white,
    marginTop: spacing.small,
  },
  placeholderContainer: {
    flex: 1,
    borderRadius: borderRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    ...typography.body,
    marginTop: spacing.medium,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    marginHorizontal: spacing.medium,
    marginBottom: spacing.small,
    padding: spacing.small,
    backgroundColor: colors.error[50],
    borderRadius: borderRadius.small,
  },
  errorText: {
    ...typography.caption,
    color: colors.error[700],
    flex: 1,
  },
  controlsScroll: {
    flex: 1,
  },
  controlsContent: {
    padding: spacing.medium,
    paddingBottom: spacing.xlarge,
  },
  section: {
    marginBottom: spacing.large,
  },
  advancedToggle: {
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    marginBottom: spacing.medium,
  },
  advancedToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    paddingVertical: spacing.medium,
    paddingHorizontal: spacing.medium,
  },
  advancedToggleText: {
    ...typography.body,
    fontWeight: '500',
  },
  advancedSection: {
    paddingTop: spacing.small,
  },
  buttonContainer: {
    marginTop: spacing.medium,
  },
});
