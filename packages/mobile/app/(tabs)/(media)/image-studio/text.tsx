/**
 * Text Selection Screen
 * Text generation and selection step for Image Studio
 */

import { useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { router, Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useImageStudio } from '@gruenerator/shared/image-studio';
import { TextSelectionStep } from '../../../../components/image-studio/TextSelectionStep';
import { useImageStudioStore } from '../../../../stores/imageStudioStore';
import { lightTheme, darkTheme } from '../../../../theme';

export default function TextScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const {
    type,
    formData,
    generatedText,
    selectedAlternativeIndex,
    textLoading,
    error,
    setGeneratedText,
    selectAlternative,
    applyAlternative,
    setTextLoading,
    setError,
  } = useImageStudioStore();

  const { generateText } = useImageStudio({
    onTextGenerated: (result) => {
      setGeneratedText(result);
    },
    onError: (err) => {
      setError(err);
    },
  });

  const handleGenerateText = useCallback(async () => {
    if (!type) return;

    setTextLoading(true);
    setError(null);

    try {
      await generateText(type, {
        thema: String(formData.thema || ''),
        name: formData.name != null ? String(formData.name) : undefined,
      });
    } catch (err) {
      // Error is handled in onError callback
    } finally {
      setTextLoading(false);
    }
  }, [type, formData, generateText, setTextLoading, setError]);

  useEffect(() => {
    if (!generatedText && !textLoading && !error) {
      handleGenerateText();
    }
  }, []);

  const handleNext = () => {
    router.push('./result' as Href);
  };

  const handleRetry = () => {
    handleGenerateText();
  };

  if (!type) {
    router.replace('/image-studio' as Href);
    return null;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['bottom']}>
      <TextSelectionStep
        type={type}
        generatedText={generatedText}
        formData={formData}
        selectedAlternativeIndex={selectedAlternativeIndex}
        loading={textLoading}
        error={error}
        onSelectAlternative={selectAlternative}
        onApplyAlternative={applyAlternative}
        onNext={handleNext}
        onBack={() => router.back()}
        onRetry={handleRetry}
      />
    </SafeAreaView>
  );
}
