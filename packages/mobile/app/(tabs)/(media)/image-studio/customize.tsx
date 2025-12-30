/**
 * Customize Screen
 * Image modification and customization step for Image Studio
 */

import { useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useImageStudio, type DreizeilenModificationParams } from '@gruenerator/shared/image-studio';
import { ModificationStep } from '../../../../components/image-studio/ModificationStep';
import { useImageStudioStore, selectDreizeilenModifications } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function CustomizeScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    type,
    formData,
    uploadedImageBase64,
    generatedImage,
    modifications,
    isAdvancedMode,
    canvasLoading,
    modificationLoading,
    error,
    initModifications,
    updateModification,
    resetModifications,
    toggleAdvancedMode,
    setGeneratedImage,
    setCanvasLoading,
    setModificationLoading,
    setError,
  } = useImageStudioStore();

  const dreizeilenModifications = useImageStudioStore(selectDreizeilenModifications);

  const { generateCanvas } = useImageStudio({
    onImageGenerated: (image) => {
      setGeneratedImage(image);
    },
    onError: (err) => {
      setError(err);
    },
  });

  useEffect(() => {
    if (type && !modifications) {
      initModifications();
    }
  }, [type, modifications, initModifications]);

  useEffect(() => {
    if (!generatedImage && type && !canvasLoading && !error) {
      handleGenerateCanvas();
    }
  }, []);

  const handleGenerateCanvas = useCallback(async () => {
    if (!type || !dreizeilenModifications) return;

    setCanvasLoading(true);
    setError(null);

    try {
      await generateCanvas(type, {
        type,
        imageData: uploadedImageBase64 || undefined,
        formData,
        fontSize: dreizeilenModifications.fontSize,
        balkenOffset: dreizeilenModifications.balkenOffset,
        balkenGruppenOffset: dreizeilenModifications.balkenGruppenOffset,
        sunflowerOffset: dreizeilenModifications.sunflowerOffset,
        colorScheme: dreizeilenModifications.colorScheme,
        credit: dreizeilenModifications.credit,
      });
    } catch {
      // Error handled in onError callback
    } finally {
      setCanvasLoading(false);
    }
  }, [type, formData, uploadedImageBase64, dreizeilenModifications, generateCanvas, setCanvasLoading, setError]);

  const handleRegenerate = useCallback(async () => {
    if (!type || !dreizeilenModifications) return;

    setModificationLoading(true);
    setError(null);

    try {
      await generateCanvas(type, {
        type,
        imageData: uploadedImageBase64 || undefined,
        formData,
        fontSize: dreizeilenModifications.fontSize,
        balkenOffset: dreizeilenModifications.balkenOffset,
        balkenGruppenOffset: dreizeilenModifications.balkenGruppenOffset,
        sunflowerOffset: dreizeilenModifications.sunflowerOffset,
        colorScheme: dreizeilenModifications.colorScheme,
        credit: dreizeilenModifications.credit,
      });
    } catch {
      // Error handled in onError callback
    } finally {
      setModificationLoading(false);
    }
  }, [type, formData, uploadedImageBase64, dreizeilenModifications, generateCanvas, setModificationLoading, setError]);

  const handleModificationChange = useCallback(
    <K extends keyof DreizeilenModificationParams>(
      key: K,
      value: DreizeilenModificationParams[K]
    ) => {
      updateModification(key, value);
    },
    [updateModification]
  );

  const handleNext = () => {
    router.push('./result' as Href);
  };

  if (!type) {
    router.replace('/image-studio' as Href);
    return null;
  }

  if (type !== 'dreizeilen') {
    router.push('./result' as Href);
    return null;
  }

  if (!dreizeilenModifications) {
    return null;
  }

  const isLoading = canvasLoading || modificationLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <ModificationStep
        type={type}
        generatedImage={generatedImage}
        modifications={dreizeilenModifications}
        isAdvancedMode={isAdvancedMode}
        loading={isLoading}
        error={error}
        onModificationChange={handleModificationChange}
        onToggleAdvanced={toggleAdvancedMode}
        onReset={resetModifications}
        onRegenerate={handleRegenerate}
        onNext={handleNext}
        onBack={() => router.back()}
      />
    </SafeAreaView>
  );
}
