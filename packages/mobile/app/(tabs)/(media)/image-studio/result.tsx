/**
 * Result Screen
 * Final generated image display for Image Studio
 */

import { useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useImageStudio } from '@gruenerator/shared/image-studio';
import { ResultDisplay } from '../../../../components/image-studio/ResultDisplay';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function ResultScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    type,
    formData,
    uploadedImageBase64,
    generatedImage,
    canvasLoading,
    error,
    setGeneratedImage,
    setCanvasLoading,
    setError,
    reset,
  } = useImageStudioStore();

  const { generateCanvas, generateText2Sharepic } = useImageStudio({
    onImageGenerated: (image) => {
      setGeneratedImage(image);
    },
    onError: (err) => {
      setError(err);
    },
  });

  const handleGenerateCanvas = useCallback(async () => {
    if (!type) return;

    setCanvasLoading(true);
    setError(null);

    try {
      if (type === 'text2sharepic') {
        await generateText2Sharepic({
          description: String(formData.description || formData.thema || ''),
          mood: formData.mood != null ? String(formData.mood) : undefined,
        });
      } else {
        await generateCanvas(type, {
          type,
          imageData: uploadedImageBase64 || undefined,
          formData,
        });
      }
    } catch (err) {
      // Error is handled in onError callback
    } finally {
      setCanvasLoading(false);
    }
  }, [type, formData, uploadedImageBase64, generateCanvas, generateText2Sharepic, setCanvasLoading, setError]);

  useEffect(() => {
    if (!generatedImage && !canvasLoading && !error) {
      handleGenerateCanvas();
    }
  }, []);

  const handleNewGeneration = () => {
    reset();
    router.replace('/image-studio' as Href);
  };

  const handleRetry = () => {
    handleGenerateCanvas();
  };

  if (!type) {
    router.replace('/image-studio' as Href);
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <ResultDisplay
        generatedImage={generatedImage}
        loading={canvasLoading}
        error={error}
        onNewGeneration={handleNewGeneration}
        onBack={() => router.back()}
        onRetry={handleRetry}
      />
    </SafeAreaView>
  );
}
