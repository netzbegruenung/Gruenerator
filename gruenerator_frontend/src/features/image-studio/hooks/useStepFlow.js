import { useState, useCallback, useMemo, useEffect } from 'react';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useImageGeneration } from './useImageGeneration';
import { getTypeConfig, getTemplateFieldConfig, FORM_STEPS } from '../utils/typeConfig';
import apiClient from '../../../components/utils/apiClient';

export const useStepFlow = () => {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    type,
    thema,
    name,
    line1, line2, line3,
    quote,
    header, subheader, body,
    uploadedImage,
    selectedImage,
    fontSize,
    colorScheme,
    balkenOffset,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    // Veranstaltung-specific fields
    eventTitle,
    beschreibung,
    weekday,
    date,
    time,
    locationName,
    address,
    // KI-specific fields
    purePrompt,
    sharepicPrompt,
    imagineTitle,
    variant,
    precisionInstruction,
    precisionMode,
    selectedInfrastructure,
    allyPlacement,
    updateFormData,
    setSloganAlternatives,
    setGeneratedImage,
    setCurrentStep,
    setFlowTitle,
    setFlowSubtitle,
    setPreloadedImageResult,
    setSlogansReady
  } = useImageStudioStore();

  const { generateText, generateImage, loading, error, setError } = useImageGeneration();

  const typeConfig = useMemo(() => getTypeConfig(type), [type]);
  const fieldConfig = useMemo(() => getTemplateFieldConfig(type), [type]);

  const flowSteps = useMemo(() => {
    if (!fieldConfig) return [];

    const steps = [];
    const inputBeforeImage = typeConfig?.inputBeforeImage ?? false;

    // For inputBeforeImage types: INPUT fields come FIRST
    if (inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach((field, index) => {
        const isLastInput = index === fieldConfig.inputFields.length - 1;
        // For parallelPreload types, trigger parallel loading after last input
        const afterComplete = isLastInput && typeConfig?.parallelPreload
          ? 'parallelPreload'
          : null;

        steps.push({
          id: field.name,
          type: 'input',
          field,
          stepTitle: field.label,
          stepSubtitle: field.subtitle || field.helpText || null,
          afterComplete
        });
      });
    }

    // Image upload step (if required)
    if (typeConfig?.requiresImage) {
      // For parallelPreload, text generation already happened - don't trigger again
      const imageUploadAfterComplete = inputBeforeImage && !typeConfig?.parallelPreload
        ? 'generateText'
        : null;

      steps.push({
        id: 'image_upload',
        type: 'image_upload',
        stepTitle: 'Bild auswählen',
        stepSubtitle: 'Ziehe ein Bild hierher oder klicke zum Auswählen (JPG, PNG, WebP)',
        afterComplete: imageUploadAfterComplete
      });
    }

    // For default flow: INPUT fields come AFTER image upload
    if (!inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach((field, index) => {
        const isLast = index === fieldConfig.inputFields.length - 1;
        const afterComplete = isLast
          ? (fieldConfig.skipSloganStep
              ? (fieldConfig.afterLastInputTrigger || 'generateImage')
              : 'generateText')
          : null;

        steps.push({
          id: field.name,
          type: 'input',
          field,
          stepTitle: field.label,
          stepSubtitle: field.subtitle || field.helpText || null,
          afterComplete
        });
      });
    }

    // Slogan selection (only for template types)
    if (!fieldConfig.skipSloganStep) {
      steps.push({
        id: 'slogan-select',
        type: 'slogan',
        stepTitle: 'Text auswählen',
        stepSubtitle: 'Wähle einen der generierten Texte aus',
        afterComplete: 'generateImage'
      });
    }

    return steps;
  }, [fieldConfig, typeConfig]);

  const currentStep = useMemo(() => flowSteps[stepIndex] || null, [flowSteps, stepIndex]);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === flowSteps.length - 1;
  const totalSteps = flowSteps.length;

  // Update flow title and subtitle when step changes
  useEffect(() => {
    if (currentStep?.stepTitle) {
      setFlowTitle(currentStep.stepTitle);
    }
    setFlowSubtitle(currentStep?.stepSubtitle || null);
  }, [currentStep, setFlowTitle, setFlowSubtitle]);

  const executeTextGeneration = useCallback(async () => {
    setError('');
    setIsProcessing(true);

    try {
      const formData = { thema, name };
      const result = await generateText(type, formData);

      if (result && fieldConfig?.responseMapping) {
        const mappedData = fieldConfig.responseMapping(result);
        updateFormData(mappedData);
        setSloganAlternatives(result.alternatives || []);
      }
      return true;
    } catch (err) {
      console.error('[useStepFlow] Text generation error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [type, thema, name, fieldConfig, generateText, updateFormData, setSloganAlternatives, setError]);

  const executeTemplateImageGeneration = useCallback(async () => {
    setError('');
    setIsProcessing(true);

    try {
      const formData = {
        type: typeConfig?.legacyType || type,
        line1, line2, line3,
        quote,
        name,
        header, subheader, body,
        uploadedImage: uploadedImage || selectedImage,
        fontSize,
        colorScheme,
        balkenOffset,
        balkenGruppenOffset,
        sunflowerOffset,
        credit,
        // Veranstaltung fields
        eventTitle,
        beschreibung,
        weekday,
        date,
        time,
        locationName,
        address
      };

      const image = await generateImage(type, formData);
      setGeneratedImage(image);
      return true;
    } catch (err) {
      console.error('[useStepFlow] Template image generation error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [
    type, typeConfig,
    line1, line2, line3, quote, name,
    header, subheader, body,
    uploadedImage, selectedImage,
    fontSize, colorScheme, balkenOffset,
    balkenGruppenOffset, sunflowerOffset, credit,
    eventTitle, beschreibung, weekday, date, time, locationName, address,
    generateImage, setGeneratedImage, setError
  ]);

  const executeKiImageGeneration = useCallback(async () => {
    setError('');
    setIsProcessing(true);

    try {
      const formData = {
        purePrompt,
        sharepicPrompt,
        imagineTitle,
        variant,
        uploadedImage,
        precisionMode: typeConfig?.alwaysPrecision || precisionMode,
        precisionInstruction,
        selectedInfrastructure,
        allyPlacement
      };

      const image = await generateImage(type, formData);
      setGeneratedImage(image);
      return true;
    } catch (err) {
      console.error('[useStepFlow] KI image generation error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [
    type, typeConfig,
    purePrompt, sharepicPrompt, imagineTitle, variant,
    uploadedImage, precisionMode, precisionInstruction,
    selectedInfrastructure, allyPlacement,
    generateImage, setGeneratedImage, setError
  ]);

  const fetchAiImageSuggestion = useCallback(async (text) => {
    try {
      const response = await apiClient.post('/image-picker/select', {
        text,
        type: 'sharepic'
      });
      if (response.data.success) {
        return {
          image: response.data.selectedImage,
          category: response.data.selectedImage.category
        };
      }
    } catch (error) {
      console.error('[useStepFlow] AI image suggestion failed:', error);
    }
    return null;
  }, []);

  const executeParallelPreload = useCallback(async () => {
    setError('');
    setIsProcessing(true);

    try {
      const textForSuggestion = thema || '';
      if (!textForSuggestion.trim()) {
        setIsProcessing(false);
        return true;
      }

      const imagePromise = fetchAiImageSuggestion(textForSuggestion);

      const textPromise = (async () => {
        const formData = { thema, name };
        const result = await generateText(type, formData);
        if (result && fieldConfig?.responseMapping) {
          const mappedData = fieldConfig.responseMapping(result);
          updateFormData(mappedData);
          setSloganAlternatives(result.alternatives || []);
        }
        setSlogansReady(true);
        return true;
      })();

      const imageResult = await imagePromise;
      if (imageResult) {
        setPreloadedImageResult(imageResult);
      }

      textPromise.catch(err => {
        console.error('[useStepFlow] Background text generation error:', err);
      });

      return true;
    } catch (err) {
      console.error('[useStepFlow] Parallel preload error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [
    thema, name, type, fieldConfig,
    fetchAiImageSuggestion, generateText, updateFormData,
    setSloganAlternatives, setError,
    setPreloadedImageResult, setSlogansReady
  ]);

  const goNext = useCallback(async () => {
    if (isProcessing) return false;

    const step = currentStep;
    if (!step) return false;

    // Handle parallel preload (both image suggestion and text generation)
    if (step.afterComplete === 'parallelPreload') {
      const success = await executeParallelPreload();
      if (!success) return false;
    }

    // Handle text generation (after last input field for template types)
    if (step.afterComplete === 'generateText') {
      const success = await executeTextGeneration();
      if (!success) return false;
    }

    // Handle image generation (after slogan selection or after last input for KI types)
    if (step.afterComplete === 'generateImage') {
      const success = typeConfig?.usesFluxApi
        ? await executeKiImageGeneration()
        : await executeTemplateImageGeneration();
      if (!success) return false;
      setCurrentStep(FORM_STEPS.RESULT);
      return true;
    }

    // Advance to next internal step
    if (stepIndex < flowSteps.length - 1) {
      setDirection(1);
      setStepIndex(prev => prev + 1);
      return true;
    }

    return false;
  }, [
    currentStep, stepIndex, flowSteps.length, isProcessing, typeConfig,
    executeTextGeneration, executeTemplateImageGeneration, executeKiImageGeneration,
    executeParallelPreload, setCurrentStep
  ]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) {
      setDirection(-1);
      setStepIndex(prev => prev - 1);
      return true;
    }
    return false;
  }, [stepIndex]);

  const reset = useCallback(() => {
    setStepIndex(0);
    setDirection(1);
    setIsProcessing(false);
  }, []);

  const getFieldValue = useCallback((fieldName) => {
    const values = {
      // Template fields
      thema, name, line1, line2, line3, quote, header, subheader, body,
      // Veranstaltung fields
      eventTitle, beschreibung, weekday, date, time, locationName, address,
      // KI fields
      purePrompt, sharepicPrompt, imagineTitle, precisionInstruction, allyPlacement
    };
    return values[fieldName] || '';
  }, [thema, name, line1, line2, line3, quote, header, subheader, body, eventTitle, beschreibung, weekday, date, time, locationName, address, purePrompt, sharepicPrompt, imagineTitle, precisionInstruction, allyPlacement]);

  return {
    stepIndex,
    direction,
    currentStep,
    flowSteps,
    isFirstStep,
    isLastStep,
    totalSteps,
    isProcessing,
    loading: loading || isProcessing,
    error,
    goNext,
    goBack,
    reset,
    getFieldValue,
    setError
  };
};

export default useStepFlow;
