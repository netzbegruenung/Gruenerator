/**
 * Image Upload Screen
 * Image upload step for Image Studio (templates and KI edit types)
 */

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, useColorScheme, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { route } from '../../../../types/routes';
import { SafeAreaView } from 'react-native-safe-area-context';
import { typeHasTextGeneration } from '@gruenerator/shared/image-studio';
import { ImageUploadStep } from '../../../../components/image-studio/ImageUploadStep';
import { useImageStudioStore, selectBgRemovalState } from '../../../../stores/imageStudioStore';
import { generateProfilbild } from '../../../../services/imageStudio';
import {
  lightTheme,
  darkTheme,
  colors,
  spacing,
  borderRadius,
  typography,
} from '../../../../theme';

export default function ImageScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const isDark = colorScheme === 'dark';

  const {
    type,
    kiType,
    uploadedImageUri,
    uploadedImageBase64,
    setUploadedImage,
    clearUploadedImage,
    setGeneratedImage,
    setError,
    setBgRemovalProgress,
    setBgRemovalLoading,
    resetBgRemoval,
  } = useImageStudioStore();

  const bgRemovalState = useImageStudioStore(selectBgRemovalState);

  const handleNext = async () => {
    // KI edit types go to ki-input for instruction entry
    if (kiType) {
      router.push(route('/(tabs)/(media)/image-studio/ki-input'));
      return;
    }

    // Template types follow existing flow
    if (!type) return;

    // Special handling for profilbild: run background removal + canvas generation
    if (type === 'profilbild') {
      if (!uploadedImageBase64) {
        setError('Bitte wähle zuerst ein Bild aus');
        return;
      }

      try {
        setBgRemovalLoading(true);
        setBgRemovalProgress(0, 'Starte Verarbeitung...');

        const resultImage = await generateProfilbild(uploadedImageBase64, (progress) => {
          setBgRemovalProgress(progress.progress, progress.message);
        });

        setGeneratedImage(resultImage);
        resetBgRemoval();
        router.push(route('/(tabs)/(media)/image-studio/result'));
      } catch (error) {
        resetBgRemoval();
        setError(error instanceof Error ? error.message : 'Fehler bei der Profilbild-Erstellung');
      }
      return;
    }

    if (typeHasTextGeneration(type)) {
      router.push(route('/(tabs)/(media)/image-studio/text'));
    } else {
      router.push(route('/(tabs)/(media)/image-studio/result'));
    }
  };

  // Redirect if neither type nor kiType is selected
  useEffect(() => {
    if (!type && !kiType) {
      router.replace(route('/(tabs)/(media)/image-studio'));
    }
  }, [type, kiType]);

  if (!type && !kiType) {
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <ImageUploadStep
        uploadedImageUri={uploadedImageUri}
        onImageSelected={setUploadedImage}
        onClearImage={clearUploadedImage}
        onNext={handleNext}
        onBack={() => router.back()}
        disabled={bgRemovalState.loading}
      />

      {bgRemovalState.loading && (
        <View
          style={[
            styles.loadingOverlay,
            { backgroundColor: isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)' },
          ]}
        >
          <View
            style={[
              styles.loadingCard,
              { backgroundColor: isDark ? colors.grey[900] : colors.white },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary[500]} />
            <Text style={[styles.loadingTitle, { color: theme.text }]}>
              Profilbild wird erstellt
            </Text>
            <Text style={[styles.loadingMessage, { color: theme.textSecondary }]}>
              {bgRemovalState.message || 'Bitte warten...'}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(bgRemovalState.progress * 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              {Math.round(bgRemovalState.progress * 100)}%
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingCard: {
    padding: spacing.xlarge,
    borderRadius: borderRadius.large,
    alignItems: 'center',
    minWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  loadingTitle: {
    ...typography.h4,
    marginTop: spacing.medium,
    marginBottom: spacing.xsmall,
  },
  loadingMessage: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.medium,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: colors.grey[200],
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.full,
  },
  progressText: {
    ...typography.caption,
    marginTop: spacing.small,
  },
});
