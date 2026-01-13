import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import useImageStudioStore from '../../../stores/imageStudioStore';
import type { SloganAlternative } from '../types/storeTypes';
import { usePreloadStore } from './usePreloadStore';
import { useImageGeneration } from './useImageGeneration';
import { getTypeConfig, getTemplateFieldConfig, FORM_STEPS, TypeConfig, IMAGE_STUDIO_TYPES } from '../utils/typeConfig';
import apiClient from '../../../components/utils/apiClient';
import { removeBackground } from '../../../services/backgroundRemoval';

// ... (interfaces)

interface FlowStep {
  id: string;
  type: 'input' | 'image_upload' | 'canvas_edit' | 'image_size_select';
  field?: {
    name: string;
    label: string;
    subtitle?: string;
    helpText?: string;
  };
  stepTitle: string | null;
  stepSubtitle: string | null;
  afterComplete: string | null;
}

interface BgRemovalProgress {
  phase: 'downloading' | 'processing' | 'compressing';
  progress: number;
  message: string;
}

interface UseStepFlowOptions {
  startAtCanvasEdit?: boolean;
}

interface AiImageSuggestionResult {
  image: {
    category?: string;
    [key: string]: unknown;
  };
  category?: string;
}

interface UseStepFlowReturn {
  stepIndex: number;
  direction: number;
  currentStep: FlowStep | null;
  flowSteps: FlowStep[];
  isFirstStep: boolean;
  isLastStep: boolean;
  totalSteps: number;
  isProcessing: boolean;
  loading: boolean;
  error: string;
  bgRemovalProgress: BgRemovalProgress | null;
  transparentImage: string | null;
  typeConfig: TypeConfig | null;
  goNext: () => Promise<boolean>;
  goBack: () => boolean;
  reset: () => void;
  getFieldValue: (fieldName: string) => string;
  setError: (error: string) => void;
  handleCanvasExport: (dataUrl: string) => void;
  handleCanvasSave: (dataUrl: string) => void;
  goBackToCanvas: () => void;
}

export const useStepFlow = ({ startAtCanvasEdit = false }: UseStepFlowOptions = {}): UseStepFlowReturn => {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState<BgRemovalProgress | null>(null);
  const hasInitializedCanvasEditRef = useRef(false);

  const {
    type,
    thema,
    name,
    line1, line2, line3,
    quote,
    header, subheader, body,
    headline, subtext,
    uploadedImage,
    selectedImage,
    fontSize,
    colorScheme,
    balkenOffset,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    eventTitle,
    beschreibung,
    weekday,
    date,
    time,
    locationName,
    address,
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
    transparentImage,
    setTransparentImage
  } = useImageStudioStore();

  const { setPreloadedImageResult, setSlogansReady } = usePreloadStore();

  const { generateText, generateImage, fetchAlternativesInBackground, loading, error, setError } = useImageGeneration();

  const typeConfig = useMemo(() => getTypeConfig(type || ''), [type]);
  const fieldConfig = useMemo(() => getTemplateFieldConfig(type || ''), [type]);

  const flowSteps = useMemo((): FlowStep[] => {
    if (!fieldConfig) return [];

    const steps: FlowStep[] = [];
    const inputBeforeImage = typeConfig?.inputBeforeImage ?? false;

    if (inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach((field: Record<string, unknown>, index: number) => {
        const isLastInput = index === fieldConfig.inputFields.length - 1;
        const afterComplete = isLastInput && typeConfig?.parallelPreload
          ? 'parallelPreload'
          : null;

        steps.push({
          id: field.name as string,
          type: 'input',
          field: field as { name: string; label: string; subtitle?: string; helpText?: string },
          stepTitle: field.label as string,
          stepSubtitle: (field.subtitle as string) || (field.helpText as string) || null,
          afterComplete
        });
      });
    }

    if (typeConfig?.requiresImage) {
      let imageUploadAfterComplete: string | null = null;
      if (typeConfig?.hasBackgroundRemoval) {
        imageUploadAfterComplete = 'backgroundRemoval';
      } else if (inputBeforeImage && !typeConfig?.parallelPreload) {
        imageUploadAfterComplete = 'generateText';
      }

      const stepTitle = typeConfig?.hasBackgroundRemoval
        ? 'Foto auswählen'
        : 'Bild auswählen';
      const stepSubtitle = typeConfig?.hasBackgroundRemoval
        ? 'Wähle ein Porträtfoto aus'
        : 'Ziehe ein Bild hierher oder klicke zum Auswählen (JPG, PNG, WebP)';

      steps.push({
        id: 'image_upload',
        type: 'image_upload',
        stepTitle,
        stepSubtitle,
        afterComplete: imageUploadAfterComplete
      });

      if (typeConfig?.hasBackgroundRemoval) {
        steps.push({
          id: 'canvas_edit',
          type: 'canvas_edit',
          stepTitle: 'Position anpassen',
          stepSubtitle: 'Ziehe und skaliere dein Bild',
          afterComplete: null
        });
      }

    }

    if (!inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach((field: Record<string, unknown>, index: number) => {
        const isLast = index === fieldConfig.inputFields.length - 1;
        let afterComplete: string | null = null;

        if (isLast) {
          if (typeConfig?.hasTextCanvasEdit) {
            afterComplete = 'generateText';
          } else {
            // Use afterLastInputTrigger if defined, otherwise default to 'generateImage'
            // Explicitly check for undefined to allow null values through
            afterComplete = fieldConfig.afterLastInputTrigger !== undefined
              ? fieldConfig.afterLastInputTrigger as string | null
              : 'generateImage';
          }
        }

        steps.push({
          id: field.name as string,
          type: 'input',
          field: field as { name: string; label: string; subtitle?: string; helpText?: string },
          stepTitle: field.label as string,
          stepSubtitle: (field.subtitle as string) || (field.helpText as string) || null,
          afterComplete
        });
      });
    }

    // Add image size selection step for ALL FLUX types
    // For requiresImage types: comes after image upload
    // For pure creation types: comes after prompt input
    console.log('[useStepFlow] Checking IMAGE_SIZE_SELECT condition:', {
      typeId: typeConfig?.id,
      usesFluxApi: typeConfig?.usesFluxApi,
      hasBackgroundRemoval: typeConfig?.hasBackgroundRemoval,
      requiresImage: typeConfig?.requiresImage,
      shouldAdd: typeConfig?.usesFluxApi && !typeConfig?.hasBackgroundRemoval
    });

    if (typeConfig?.usesFluxApi && !typeConfig?.hasBackgroundRemoval) {
      const afterComplete = typeConfig?.requiresImage ? null : 'generateImage';

      console.log('[useStepFlow] Adding IMAGE_SIZE_SELECT step with afterComplete:', afterComplete);

      steps.push({
        id: 'image_size_select',
        type: 'image_size_select',
        stepTitle: 'Bildgröße auswählen',
        stepSubtitle: 'Wähle das passende Format für deine Social-Media-Plattform',
        afterComplete
      });
    }

    if (typeConfig?.hasTextGeneration && !typeConfig?.usesFluxApi) {
      steps.push({
        id: 'text_canvas_edit',
        type: 'canvas_edit',
        stepTitle: null,
        stepSubtitle: null,
        afterComplete: null
      });
    }

    console.log('[useStepFlow] Final steps array:', steps.map(s => ({ id: s.id, type: s.type, afterComplete: s.afterComplete })));

    return steps;
  }, [fieldConfig, typeConfig]);

  const currentStep = useMemo(() => {
    const step = flowSteps[stepIndex] || null;
    console.log('[useStepFlow] Current step:', { stepIndex, totalSteps: flowSteps.length, step: step ? { id: step.id, type: step.type } : null });
    return step;
  }, [flowSteps, stepIndex]);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === flowSteps.length - 1;
  const totalSteps = flowSteps.length;

  useEffect(() => {
    if (startAtCanvasEdit && !hasInitializedCanvasEditRef.current && flowSteps.length > 0) {
      const canvasEditIndex = flowSteps.findIndex(step => step.type === 'canvas_edit');
      if (canvasEditIndex >= 0) {
        setStepIndex(canvasEditIndex);
        setDirection(1);
        hasInitializedCanvasEditRef.current = true;
      }
    }
  }, [startAtCanvasEdit, flowSteps]);

  useEffect(() => {
    // Always update title - set to null when stepTitle is null/undefined (e.g., canvas edit)
    setFlowTitle(currentStep?.stepTitle || null);
    setFlowSubtitle(currentStep?.stepSubtitle || null);
  }, [currentStep, setFlowTitle, setFlowSubtitle]);

  const executeTextGeneration = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);

    try {
      const formData = { thema, name, count: 1 };
      const result = await generateText(type!, formData);

      if (result && fieldConfig?.responseMapping) {
        const mappedData = fieldConfig.responseMapping(result as Record<string, unknown>);
        updateFormData(mappedData as Record<string, unknown>);

        // Store original as first alternative
        const originalAlternative: SloganAlternative = fieldConfig.alternativesMapping
          ? fieldConfig.alternativesMapping(mappedData as Record<string, unknown>)
          : (mappedData as SloganAlternative);
        setSloganAlternatives([originalAlternative]);

        setTimeout(() => {
          fetchAlternativesInBackground(
            type!,
            formData,
            (alternatives) => {
              // Prepend original to alternatives list
              setSloganAlternatives([originalAlternative, ...alternatives]);
            },
            (error) => {
              console.error('[StepFlow] Alternatives error:', error);
            }
          );
        }, 100);
      }
      return true;
    } catch (err) {
      console.error('[useStepFlow] Text generation error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [type, thema, name, fieldConfig, generateText, fetchAlternativesInBackground, updateFormData, setSloganAlternatives, setError]);

  const executeTemplateImageGeneration = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);

    try {
      // Validate that we have text content for text-based types
      if (typeConfig?.hasTextGeneration) {
        const hasText = line1?.trim() || line2?.trim() || line3?.trim() ||
                       quote?.trim() || header?.trim() || headline?.trim();

        if (!hasText) {
          setError('Kein Text generiert. Bitte starte die Generierung erneut.');
          return false;
        }
      }

      const formData = {
        type: typeConfig?.legacyType || type,
        line1, line2, line3,
        quote,
        name,
        header, subheader, body,
        headline, subtext,
        uploadedImage: (uploadedImage || selectedImage) as File | Blob | null,
        fontSize,
        colorScheme,
        balkenOffset,
        balkenGruppenOffset,
        sunflowerOffset,
        credit,
        eventTitle,
        beschreibung,
        weekday,
        date,
        time,
        locationName,
        address
      };

      const image = await generateImage(type!, formData);
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
    headline, subtext,
    uploadedImage, selectedImage,
    fontSize, colorScheme, balkenOffset,
    balkenGruppenOffset, sunflowerOffset, credit,
    eventTitle, beschreibung, weekday, date, time, locationName, address,
    generateImage, setGeneratedImage, setError
  ]);

  const executeKiImageGeneration = useCallback(async (): Promise<boolean> => {
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

      const image = await generateImage(type!, formData);
      setGeneratedImage(image);

      // Commit to AI Editor history if applicable
      if (type === IMAGE_STUDIO_TYPES.AI_EDITOR) {
        const { commitAiGeneration } = useImageStudioStore.getState();
        commitAiGeneration(image, purePrompt);
      }

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

  const executeBackgroundRemoval = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);
    setBgRemovalProgress({ phase: 'processing', progress: 0, message: 'Hintergrund wird entfernt...' });

    try {
      const currentImage = useImageStudioStore.getState().uploadedImage;
      if (!currentImage) {
        throw new Error('Kein Bild hochgeladen');
      }

      const { url: transparentUrl } = await removeBackground(
        currentImage,
        (progress: BgRemovalProgress) => setBgRemovalProgress(progress)
      );

      setTransparentImage(transparentUrl);
      return true;
    } catch (err) {
      console.error('[useStepFlow] Background removal error:', err);
      setError((err as Error).message || 'Fehler beim Entfernen des Hintergrunds');
      return false;
    } finally {
      setIsProcessing(false);
      setBgRemovalProgress(null);
    }
  }, [setError, setTransparentImage]);

  const handleCanvasExport = useCallback((dataUrl: string) => {
    setGeneratedImage(dataUrl);
    setCurrentStep(FORM_STEPS.RESULT);
  }, [setGeneratedImage, setCurrentStep]);

  const handleCanvasSave = useCallback((dataUrl: string) => {
    // Just update the image, don't change step
    // This triggers useTemplateResultAutoSave or useTemplateResultActions logic
    setGeneratedImage(dataUrl);
  }, [setGeneratedImage]);

  const goBackToCanvas = useCallback(() => {
    setCurrentStep(FORM_STEPS.CANVAS_EDIT);
  }, [setCurrentStep]);

  const fetchAiImageSuggestion = useCallback(async (text: string): Promise<AiImageSuggestionResult | null> => {
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

  const executeParallelPreload = useCallback(async (): Promise<boolean> => {
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
        try {
          const formData = { thema, name, count: 1 };
          const result = await generateText(type!, formData);

          if (result && fieldConfig?.responseMapping) {
            const mappedData = fieldConfig.responseMapping(result as Record<string, unknown>);
            updateFormData(mappedData as Record<string, unknown>);

            // Store original as first alternative
            const originalAlternative: SloganAlternative = fieldConfig.alternativesMapping
              ? fieldConfig.alternativesMapping(mappedData as Record<string, unknown>)
              : (mappedData as SloganAlternative);
            setSloganAlternatives([originalAlternative]);

            setTimeout(() => {
              fetchAlternativesInBackground(
                type!,
                formData,
                (alternatives) => {
                  // Prepend original to alternatives list
                  setSloganAlternatives([originalAlternative, ...alternatives]);
                },
                (error) => {
                  console.error('[ParallelPreload] Alternatives error:', error);
                }
              );
            }, 100);
          }
          setSlogansReady(true);
          return true;
        } catch (err) {
          console.error('[useStepFlow] Text generation error:', err);
          setSlogansReady(false);
          throw err;
        }
      })();

      // Wait for both image and text to complete
      const [imageResult, textResult] = await Promise.all([imagePromise, textPromise]);

      if (imageResult) {
        setPreloadedImageResult(imageResult as AiImageSuggestionResult);
      }

      if (!textResult) {
        setError('Texterstellung fehlgeschlagen. Bitte versuche es erneut.');
        return false;
      }

      return true;
    } catch (err) {
      console.error('[useStepFlow] Parallel preload error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [
    thema, name, type, fieldConfig,
    fetchAiImageSuggestion, generateText, fetchAlternativesInBackground, updateFormData,
    setSloganAlternatives, setError,
    setPreloadedImageResult, setSlogansReady
  ]);

  const goNext = useCallback(async (): Promise<boolean> => {
    console.log('[goNext] Called with:', { stepIndex, currentStep: currentStep ? { id: currentStep.id, type: currentStep.type, afterComplete: currentStep.afterComplete } : null });

    if (isProcessing) {
      console.log('[goNext] Blocked: isProcessing =', isProcessing);
      return false;
    }

    const step = currentStep;
    if (!step) {
      console.log('[goNext] Blocked: no current step');
      return false;
    }

    console.log('[goNext] Processing step:', { id: step.id, type: step.type, afterComplete: step.afterComplete });

    if (step.afterComplete === 'parallelPreload') {
      console.log('[goNext] Executing parallelPreload');
      const success = await executeParallelPreload();
      if (!success) return false;
    }

    if (step.afterComplete === 'generateText') {
      console.log('[goNext] Executing generateText');
      const success = await executeTextGeneration();
      if (!success) return false;
    }

    if (step.afterComplete === 'backgroundRemoval') {
      console.log('[goNext] Executing backgroundRemoval');
      const success = await executeBackgroundRemoval();
      if (!success) return false;
    }

    if (step.afterComplete === 'generateImage') {
      console.log('[goNext] Executing generateImage, jumping to RESULT');
      const success = typeConfig?.usesFluxApi
        ? await executeKiImageGeneration()
        : await executeTemplateImageGeneration();
      if (!success) return false;
      setCurrentStep(FORM_STEPS.RESULT);
      return true;
    }

    if (stepIndex < flowSteps.length - 1) {
      console.log('[goNext] Moving to next step:', stepIndex, '->', stepIndex + 1);
      setDirection(1);
      setStepIndex(prev => prev + 1);
      return true;
    }

    console.log('[goNext] At last step, cannot proceed');
    return false;
  }, [
    currentStep, stepIndex, flowSteps.length, isProcessing, typeConfig,
    executeTextGeneration, executeTemplateImageGeneration, executeKiImageGeneration,
    executeBackgroundRemoval, executeParallelPreload, setCurrentStep
  ]);

  const goBack = useCallback((): boolean => {
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

  const getFieldValue = useCallback((fieldName: string): string => {
    const values: Record<string, string> = {
      thema, name, line1, line2, line3, quote, header, subheader, body,
      headline, subtext,
      eventTitle, beschreibung, weekday, date, time, locationName, address,
      purePrompt, sharepicPrompt, imagineTitle, precisionInstruction, allyPlacement: allyPlacement || ''
    };
    return values[fieldName] || '';
  }, [thema, name, line1, line2, line3, quote, header, subheader, body, headline, subtext, eventTitle, beschreibung, weekday, date, time, locationName, address, purePrompt, sharepicPrompt, imagineTitle, precisionInstruction, allyPlacement]);

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
    bgRemovalProgress,
    transparentImage,
    typeConfig,
    goNext,
    goBack,
    reset,
    getFieldValue,
    setError,
    handleCanvasExport,
    handleCanvasSave,
    goBackToCanvas
  };
};

export default useStepFlow;
