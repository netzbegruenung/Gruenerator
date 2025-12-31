/**
 * Result Screen
 * Final generated image display for Image Studio
 * Supports both template-based (canvas) and KI (FLUX) generation
 */

import { useEffect, useCallback, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useImageStudio, useKiImageGeneration } from '@gruenerator/shared/image-studio';
import { ResultDisplay } from '../../../../components/image-studio/ResultDisplay';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function ResultScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const hasTriggeredGeneration = useRef(false);

  const {
    type,
    kiType,
    formData,
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
  }, [kiType, kiInstruction, kiVariant, kiInfrastructureOptions, uploadedImageBase64, generatePureCreate, generateKiEdit, setKiLoading, setError]);

  const handleGenerateCanvas = useCallback(async () => {
    if (!type) return;

    setCanvasLoading(true);
    setError(null);

    try {
      await generateCanvas(type, {
        type,
        imageData: uploadedImageBase64 || undefined,
        formData,
      });
    } catch (err) {
      // Error is handled in onError callback
    } finally {
      setCanvasLoading(false);
    }
  }, [type, formData, uploadedImageBase64, generateCanvas, setCanvasLoading, setError]);

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
    router.replace('/(tabs)/(media)/image-studio' as Href);
  };

  const handleRetry = () => {
    hasTriggeredGeneration.current = true;
    handleGenerate();
  };

  // Redirect if neither type nor kiType is selected
  if (!type && !kiType) {
    router.replace('/(tabs)/(media)/image-studio' as Href);
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <ResultDisplay
        generatedImage={generatedImage}
        loading={loading}
        error={error}
        onNewGeneration={handleNewGeneration}
        onBack={() => router.back()}
        onRetry={handleRetry}
      />
    </SafeAreaView>
  );
}
