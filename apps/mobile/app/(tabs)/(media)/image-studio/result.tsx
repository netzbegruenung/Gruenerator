/**
 * Result Screen
 * Final generated image display for Image Studio
 * Supports both template-based (canvas) and KI (FLUX) generation
 * Edit button navigates to fullscreen editor
 */

import { useEffect, useCallback, useRef } from 'react';
import { View, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { route } from '../../../../types/routes';
import { useImageStudio, useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { ResultDisplay } from '../../../../components/image-studio/ResultDisplay';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { supportsEditing } from '../../../../config/editSheetConfig';
import { lightTheme, darkTheme, colors } from '../../../../theme';

export default function ResultScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const insets = useSafeAreaInsets();
  const hasTriggeredGeneration = useRef(false);

  const {
    type,
    kiType,
    formData,
    uploadedImageUri,
    uploadedImageBase64,
    generatedImage,
    canvasLoading,
    kiLoading,
    error,
    kiInstruction,
    kiVariant,
    kiInfrastructureOptions,
    setGeneratedImage,
    setCanvasLoading,
    setKiLoading,
    setError,
    setRateLimitExceeded,
    reset,
  } = useImageStudioStore();

  const isKiMode = kiType !== null;
  const loading = isKiMode ? kiLoading : canvasLoading;
  const showEditButton = !isKiMode && type !== null && supportsEditing(type);

  const handleOpenEdit = useCallback(() => {
    router.push(route('/(fullscreen)/image-studio-editor'));
  }, []);

  const { generateCanvas } = useImageStudio({
    onImageGenerated: (image) => {
      setGeneratedImage(image);
    },
    onError: (err) => {
      setError(err);
    },
  });

  const { generatePureCreate, generateKiEdit } = useKiImageGeneration({
    onImageGenerated: (image) => {
      setGeneratedImage(image);
    },
    onError: (err) => {
      setError(err);
    },
    onRateLimitExceeded: () => {
      setRateLimitExceeded(true);
    },
  });

  const handleGenerateKi = useCallback(async () => {
    if (!kiType) return;

    setKiLoading(true);
    setError(null);

    try {
      if (kiType === 'pure-create') {
        await generatePureCreate({
          description: kiInstruction,
          variant: kiVariant,
        });
      } else {
        await generateKiEdit(kiType, {
          imageData: uploadedImageBase64 || '',
          instruction: kiInstruction,
          infrastructureOptions: kiType === 'green-edit' ? kiInfrastructureOptions : undefined,
        });
      }
    } catch (err) {
      // Error is handled in onError callback
    } finally {
      setKiLoading(false);
    }
  }, [
    kiType,
    kiInstruction,
    kiVariant,
    kiInfrastructureOptions,
    uploadedImageBase64,
    generatePureCreate,
    generateKiEdit,
    setKiLoading,
    setError,
  ]);

  const handleGenerateCanvas = useCallback(async () => {
    if (!type) return;

    setCanvasLoading(true);
    setError(null);

    try {
      await generateCanvas(type, {
        type,
        // Use imageUri for React Native (preferred), fallback to imageData
        imageUri: uploadedImageUri || undefined,
        imageData: uploadedImageBase64 || undefined,
        formData,
      });
    } catch (err) {
      // Error is handled in onError callback
    } finally {
      setCanvasLoading(false);
    }
  }, [
    type,
    formData,
    uploadedImageUri,
    uploadedImageBase64,
    generateCanvas,
    setCanvasLoading,
    setError,
  ]);

  const handleGenerate = useCallback(() => {
    if (isKiMode) {
      handleGenerateKi();
    } else {
      handleGenerateCanvas();
    }
  }, [isKiMode, handleGenerateKi, handleGenerateCanvas]);

  useEffect(() => {
    if (!generatedImage && !loading && !error && !hasTriggeredGeneration.current) {
      hasTriggeredGeneration.current = true;
      handleGenerate();
    }
  }, []);

  const handleNewGeneration = () => {
    reset();
    router.replace(route('/(tabs)/(media)/image-studio'));
  };

  const handleRetry = () => {
    hasTriggeredGeneration.current = true;
    handleGenerate();
  };

  // Redirect if neither type nor kiType is selected
  useEffect(() => {
    if (!type && !kiType) {
      router.replace(route('/(tabs)/(media)/image-studio'));
    }
  }, [type, kiType]);

  // Show nothing while redirecting
  if (!type && !kiType) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar hidden />
      <ResultDisplay
        generatedImage={generatedImage}
        loading={loading}
        error={error}
        onNewGeneration={handleNewGeneration}
        onBack={() => router.back()}
        onRetry={handleRetry}
        onEdit={handleOpenEdit}
        showEditButton={showEditButton}
      />
      <Pressable
        style={[styles.closeButton, { top: insets.top + 8 }]}
        onPress={handleNewGeneration}
        hitSlop={12}
      >
        <Ionicons name="close" size={28} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});
