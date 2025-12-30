/**
 * ImageStudioFlow Component
 * Main orchestrator for the image-studio wizard flow
 */

import { useEffect, useCallback } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ImageStudioTemplateType, ImageStudioStep } from '@gruenerator/shared/image-studio';
import { useImageStudio, typeRequiresImage, typeHasTextGeneration } from '@gruenerator/shared/image-studio';
import { useImageStudioStore } from '../../stores/imageStudioStore';
import { TypeSelector } from './TypeSelector';
import { StepIndicator } from './StepIndicator';
import { InputStep } from './InputStep';
import { ImageUploadStep } from './ImageUploadStep';
import { TextSelectionStep } from './TextSelectionStep';
import { ResultDisplay } from './ResultDisplay';
import { lightTheme, darkTheme, spacing } from '../../theme';

export function ImageStudioFlow() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

  // Store state
  const {
    type,
    currentStep,
    formData,
    uploadedImageUri,
    uploadedImageBase64,
    generatedText,
    generatedImage,
    selectedAlternativeIndex,
    textLoading,
    canvasLoading,
    error,
    setType,
    setStep,
    nextStep,
    previousStep,
    updateField,
    setUploadedImage,
    clearUploadedImage,
    setGeneratedText,
    selectAlternative,
    applyAlternative,
    setGeneratedImage,
    setTextLoading,
    setCanvasLoading,
    setError,
    reset,
    resetToTypeSelection,
  } = useImageStudioStore();

  // Shared hooks
  const {
    generateText,
    generateCanvas,
    generateText2Sharepic,
  } = useImageStudio({
    onTextGenerated: (result) => {
      setGeneratedText(result);
    },
    onImageGenerated: (image) => {
      setGeneratedImage(image);
    },
    onError: (err) => {
      setError(err);
    },
  });

  // Build steps array based on type
  const getStepsForType = useCallback((t: ImageStudioTemplateType | null): ImageStudioStep[] => {
    if (!t) return ['select'];

    const steps: ImageStudioStep[] = ['input'];

    if (typeRequiresImage(t)) {
      steps.push('image');
    }

    if (typeHasTextGeneration(t)) {
      steps.push('text');
    }

    steps.push('result');
    return steps;
  }, []);

  const steps = getStepsForType(type);

  // Handle type selection
  const handleTypeSelect = useCallback((selectedType: ImageStudioTemplateType) => {
    setType(selectedType);
  }, [setType]);

  // Handle text generation after input/image step
  const handleGenerateText = useCallback(async () => {
    if (!type || !typeHasTextGeneration(type)) return;

    setStep('text');
    setTextLoading(true);
    setError(null);

    try {
      await generateText(type, {
        thema: formData.thema || '',
        name: formData.name,
      });
    } catch (err) {
      // Error is handled in onError callback
    } finally {
      setTextLoading(false);
    }
  }, [type, formData, generateText, setStep, setTextLoading, setError]);

  // Handle canvas generation
  const handleGenerateCanvas = useCallback(async () => {
    if (!type) return;

    setStep('result');
    setCanvasLoading(true);
    setError(null);

    try {
      // Handle text2sharepic separately
      if (type === 'text2sharepic') {
        await generateText2Sharepic({
          description: formData.description || formData.thema || '',
          mood: formData.mood,
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
  }, [type, formData, uploadedImageBase64, generateCanvas, generateText2Sharepic, setStep, setCanvasLoading, setError]);

  // Handle next step with generation logic
  const handleNextFromInput = useCallback(async () => {
    if (!type) return;

    if (typeRequiresImage(type)) {
      // Go to image step
      nextStep();
    } else if (typeHasTextGeneration(type)) {
      // Generate text and go to text selection
      await handleGenerateText();
    } else {
      // No image, no text generation - go straight to canvas
      await handleGenerateCanvas();
    }
  }, [type, nextStep, handleGenerateText, handleGenerateCanvas]);

  const handleNextFromImage = useCallback(async () => {
    if (!type) return;

    if (typeHasTextGeneration(type)) {
      await handleGenerateText();
    } else {
      await handleGenerateCanvas();
    }
  }, [type, handleGenerateText, handleGenerateCanvas]);

  const handleNextFromText = useCallback(async () => {
    await handleGenerateCanvas();
  }, [handleGenerateCanvas]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setError(null);
    if (currentStep === 'text') {
      handleGenerateText();
    } else if (currentStep === 'result') {
      handleGenerateCanvas();
    }
  }, [currentStep, handleGenerateText, handleGenerateCanvas, setError]);

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case 'select':
        return <TypeSelector onSelect={handleTypeSelect} />;

      case 'input':
        return (
          <InputStep
            type={type!}
            formData={formData}
            onUpdateField={updateField}
            onNext={handleNextFromInput}
            onBack={resetToTypeSelection}
          />
        );

      case 'image':
        return (
          <ImageUploadStep
            uploadedImageUri={uploadedImageUri}
            onImageSelected={setUploadedImage}
            onClearImage={clearUploadedImage}
            onNext={handleNextFromImage}
            onBack={previousStep}
          />
        );

      case 'text':
        return (
          <TextSelectionStep
            type={type!}
            generatedText={generatedText}
            formData={formData}
            selectedAlternativeIndex={selectedAlternativeIndex}
            loading={textLoading}
            error={error}
            onSelectAlternative={selectAlternative}
            onApplyAlternative={applyAlternative}
            onNext={handleNextFromText}
            onBack={previousStep}
            onRetry={handleRetry}
          />
        );

      case 'result':
        return (
          <ResultDisplay
            generatedImage={generatedImage}
            loading={canvasLoading}
            error={error}
            onNewGeneration={reset}
            onBack={previousStep}
            onRetry={handleRetry}
          />
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['bottom']}>
      {type && currentStep !== 'select' && (
        <View style={styles.stepIndicator}>
          <StepIndicator currentStep={currentStep} steps={steps} />
        </View>
      )}
      <View style={styles.content}>{renderStep()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stepIndicator: {
    paddingTop: spacing.small,
  },
  content: {
    flex: 1,
  },
});
