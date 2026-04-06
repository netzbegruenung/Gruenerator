import { useState, useCallback, useMemo, useEffect, useRef } from 'react';

import apiClient from '../../../components/utils/apiClient';
import { removeBackground } from '../../../services/backgroundRemoval';
import useImageStudioStore from '../../../stores/imageStudioStore';
import {
  getTypeConfig,
  getTemplateFieldConfig,
  FORM_STEPS,
  type TypeConfig,
  IMAGE_STUDIO_TYPES,
  type InputField,
} from '../utils/typeConfig';

import { useImageGeneration } from './useImageGeneration';
import { usePreloadStore } from './usePreloadStore';

import type { SloganAlternative } from '../types/storeTypes';

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
  image?: {
    category?: string;
    [key: string]: unknown;
  };
  category?: string;
  [key: string]: unknown;
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

export const useStepFlow = ({
  startAtCanvasEdit = false,
}: UseStepFlowOptions = {}): UseStepFlowReturn => {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bgRemovalProgress, setBgRemovalProgress] = useState<BgRemovalProgress | null>(null);
  const hasInitializedCanvasEditRef = useRef(false);

  const type = useImageStudioStore((s) => s.type);
  const transparentImage = useImageStudioStore((s) => s.transparentImage);

  const { setPreloadedImageResult, setSlogansReady } = usePreloadStore();

  const { generateText, generateImage, fetchAlternativesInBackground, loading, error, setError } =
    useImageGeneration();

  const typeConfig = useMemo(() => getTypeConfig(type || ''), [type]);
  const fieldConfig = useMemo(() => getTemplateFieldConfig(type || ''), [type]);

  const flowSteps = useMemo((): FlowStep[] => {
    if (!fieldConfig) return [];

    const steps: FlowStep[] = [];
    const inputBeforeImage = typeConfig?.inputBeforeImage ?? false;

    if (inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach((field: InputField, index: number) => {
        const isLastInput = index === fieldConfig.inputFields.length - 1;
        const afterComplete = isLastInput && typeConfig?.parallelPreload ? 'parallelPreload' : null;

        steps.push({
          id: field.name,
          type: 'input',
          field: {
            name: field.name,
            label: field.label,
            subtitle: field.subtitle,
            helpText: field.helpText,
          },
          stepTitle: field.label,
          stepSubtitle: field.subtitle || field.helpText || null,
          afterComplete,
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

      const stepTitle = typeConfig?.hasBackgroundRemoval ? 'Foto auswählen' : 'Bild auswählen';
      const stepSubtitle = typeConfig?.hasBackgroundRemoval
        ? 'Wähle ein Porträtfoto aus'
        : 'Ziehe ein Bild hierher oder klicke zum Auswählen (JPG, PNG, WebP)';

      steps.push({
        id: 'image_upload',
        type: 'image_upload',
        stepTitle,
        stepSubtitle,
        afterComplete: imageUploadAfterComplete,
      });

      if (typeConfig?.hasBackgroundRemoval) {
        steps.push({
          id: 'canvas_edit',
          type: 'canvas_edit',
          stepTitle: 'Position anpassen',
          stepSubtitle: 'Ziehe und skaliere dein Bild',
          afterComplete: null,
        });
      }
    }

    if (!inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach((field: InputField, index: number) => {
        const isLast = index === fieldConfig.inputFields.length - 1;
        let afterComplete: string | null = null;

        if (isLast) {
          if (typeConfig?.hasTextCanvasEdit) {
            afterComplete = 'generateText';
          } else {
            afterComplete =
              fieldConfig.afterLastInputTrigger !== undefined
                ? (fieldConfig.afterLastInputTrigger as string | null)
                : 'generateImage';
          }
        }

        steps.push({
          id: field.name,
          type: 'input',
          field: {
            name: field.name,
            label: field.label,
            subtitle: field.subtitle,
            helpText: field.helpText,
          },
          stepTitle: field.label,
          stepSubtitle: field.subtitle || field.helpText || null,
          afterComplete,
        });
      });
    }

    // Add image size selection step for ALL FLUX types
    // For requiresImage types: comes after image upload
    // For pure creation types: comes after prompt input
    if (typeConfig?.usesFluxApi && !typeConfig?.hasBackgroundRemoval) {
      const afterComplete = typeConfig?.requiresImage ? null : 'generateImage';

      steps.push({
        id: 'image_size_select',
        type: 'image_size_select',
        stepTitle: 'Bildgröße auswählen',
        stepSubtitle: 'Wähle das passende Format für deine Social-Media-Plattform',
        afterComplete,
      });
    }

    if (typeConfig?.hasTextGeneration && !typeConfig?.usesFluxApi) {
      steps.push({
        id: 'text_canvas_edit',
        type: 'canvas_edit',
        stepTitle: null,
        stepSubtitle: null,
        afterComplete: null,
      });
    }

    return steps;
  }, [fieldConfig, typeConfig]);

  const currentStep = useMemo(() => {
    return flowSteps[stepIndex] || null;
  }, [flowSteps, stepIndex]);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === flowSteps.length - 1;
  const totalSteps = flowSteps.length;

  useEffect(() => {
    if (startAtCanvasEdit && !hasInitializedCanvasEditRef.current && flowSteps.length > 0) {
      const canvasEditIndex = flowSteps.findIndex((step) => step.type === 'canvas_edit');
      if (canvasEditIndex >= 0) {
        setStepIndex(canvasEditIndex);
        setDirection(1);
        hasInitializedCanvasEditRef.current = true;
      }
    }
  }, [startAtCanvasEdit, flowSteps]);

  useEffect(() => {
    const state = useImageStudioStore.getState();
    state.setFlowTitle(currentStep?.stepTitle || null);
    state.setFlowSubtitle(currentStep?.stepSubtitle || null);
  }, [currentStep]);

  const executeTextGeneration = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);

    try {
      const state = useImageStudioStore.getState();
      const currentType = state.type;
      const isSlider = currentType === IMAGE_STUDIO_TYPES.SLIDER;
      const formData = {
        thema: state.thema,
        name: state.name,
        ...(isSlider ? { smartCount: true } : { count: 1 }),
      };
      const result = await generateText(currentType!, formData);

      if (result && fieldConfig?.responseMapping) {
        const mappedData = fieldConfig.responseMapping(
          result as unknown as Record<string, unknown>
        );
        state.updateFormData(mappedData as Record<string, unknown>);

        const originalAlternative: SloganAlternative = fieldConfig.alternativesMapping
          ? fieldConfig.alternativesMapping(mappedData as Record<string, unknown>, 0)
          : (mappedData as SloganAlternative);
        state.setSloganAlternatives([originalAlternative]);

        if (isSlider && result.alternatives && result.alternatives.length > 0) {
          const allSlides = [
            originalAlternative,
            ...result.alternatives.map((alt, idx) =>
              fieldConfig.alternativesMapping
                ? fieldConfig.alternativesMapping(alt as Record<string, unknown>, idx + 1)
                : (alt as SloganAlternative)
            ),
          ];
          state.setSloganAlternatives(allSlides);
        } else if (!isSlider) {
          setTimeout(() => {
            void fetchAlternativesInBackground(
              currentType!,
              formData,
              (alternatives) => {
                const mappedAlternatives = fieldConfig.alternativesMapping
                  ? alternatives.map((alt, idx) =>
                      fieldConfig.alternativesMapping!(alt as Record<string, unknown>, idx + 1)
                    )
                  : alternatives;
                useImageStudioStore.getState().setSloganAlternatives([originalAlternative, ...mappedAlternatives]);
              },
              (error) => {
                console.error('[StepFlow] Alternatives error:', error);
              }
            );
          }, 100);
        }
      }
      return true;
    } catch (err) {
      console.error('[useStepFlow] Text generation error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [fieldConfig, generateText, fetchAlternativesInBackground, setError]);

  const executeTemplateImageGeneration = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);

    try {
      const state = useImageStudioStore.getState();

      if (typeConfig?.hasTextGeneration) {
        const hasText =
          state.line1?.trim() ||
          state.line2?.trim() ||
          state.line3?.trim() ||
          state.quote?.trim() ||
          state.header?.trim() ||
          state.headline?.trim();

        if (!hasText) {
          setError('Kein Text generiert. Bitte starte die Generierung erneut.');
          return false;
        }
      }

      const formData = {
        type: typeConfig?.legacyType || state.type,
        line1: state.line1,
        line2: state.line2,
        line3: state.line3,
        quote: state.quote,
        name: state.name,
        header: state.header,
        subheader: state.subheader,
        body: state.body,
        headline: state.headline,
        subtext: state.subtext,
        uploadedImage: (state.uploadedImage || state.selectedImage) as File | Blob | null,
        fontSize: state.fontSize,
        colorScheme: state.colorScheme,
        balkenOffset: state.balkenOffset,
        balkenGruppenOffset: state.balkenGruppenOffset,
        sunflowerOffset: state.sunflowerOffset,
        credit: state.credit,
        eventTitle: state.eventTitle,
        beschreibung: state.beschreibung,
        weekday: state.weekday,
        date: state.date,
        time: state.time,
        locationName: state.locationName,
        address: state.address,
      };

      const image = await generateImage(state.type!, formData);
      state.setGeneratedImage(image);
      return true;
    } catch (err) {
      console.error('[useStepFlow] Template image generation error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [typeConfig, generateImage, setError]);

  const executeKiImageGeneration = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);

    try {
      const state = useImageStudioStore.getState();

      const formData = {
        purePrompt: state.purePrompt,
        sharepicPrompt: state.sharepicPrompt,
        imagineTitle: state.imagineTitle,
        variant: state.variant,
        uploadedImage: state.uploadedImage,
        precisionMode: typeConfig?.alwaysPrecision || state.precisionMode,
        precisionInstruction: state.precisionInstruction,
        selectedInfrastructure: state.selectedInfrastructure,
        allyPlacement: state.allyPlacement,
      };

      const image = await generateImage(state.type!, formData);
      state.setGeneratedImage(image);

      if (state.type === IMAGE_STUDIO_TYPES.AI_EDITOR) {
        state.commitAiGeneration(image, state.purePrompt);
      }

      return true;
    } catch (err) {
      console.error('[useStepFlow] KI image generation error:', err);
      return false;
    } finally {
      setIsProcessing(false);
    }
  }, [typeConfig, generateImage, setError]);

  const executeBackgroundRemoval = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);
    setBgRemovalProgress({
      phase: 'processing',
      progress: 0,
      message: 'Hintergrund wird entfernt...',
    });

    try {
      const currentImage = useImageStudioStore.getState().uploadedImage;
      if (!currentImage) {
        throw new Error('Kein Bild hochgeladen');
      }

      const { url: transparentUrl } = await removeBackground(
        currentImage,
        (progress: BgRemovalProgress) => setBgRemovalProgress(progress)
      );

      useImageStudioStore.getState().setTransparentImage(transparentUrl);
      return true;
    } catch (err) {
      console.error('[useStepFlow] Background removal error:', err);
      setError((err as Error).message || 'Fehler beim Entfernen des Hintergrunds');
      return false;
    } finally {
      setIsProcessing(false);
      setBgRemovalProgress(null);
    }
  }, [setError]);

  const handleCanvasExport = useCallback((dataUrl: string) => {
    const state = useImageStudioStore.getState();
    state.setGeneratedImage(dataUrl);
    state.setCurrentStep(FORM_STEPS.RESULT);
  }, []);

  const handleCanvasSave = useCallback((dataUrl: string) => {
    useImageStudioStore.getState().setGeneratedImage(dataUrl);
  }, []);

  const goBackToCanvas = useCallback(() => {
    useImageStudioStore.getState().setCurrentStep(FORM_STEPS.CANVAS_EDIT);
  }, []);

  const fetchAiImageSuggestion = useCallback(
    async (text: string): Promise<AiImageSuggestionResult | null> => {
      try {
        const response = await apiClient.post('/image-picker/select', {
          text,
          type: 'sharepic',
        });
        if (response.data.success) {
          return {
            image: response.data.selectedImage,
            category: response.data.selectedImage.category,
          };
        }
      } catch (error) {
        console.error('[useStepFlow] AI image suggestion failed:', error);
      }
      return null;
    },
    []
  );

  const executeParallelPreload = useCallback(async (): Promise<boolean> => {
    setError('');
    setIsProcessing(true);

    try {
      const state = useImageStudioStore.getState();
      const textForSuggestion = state.thema || '';
      if (!textForSuggestion.trim()) {
        setIsProcessing(false);
        return true;
      }

      const imagePromise = fetchAiImageSuggestion(textForSuggestion);

      const textPromise = (async () => {
        try {
          const formData = { thema: state.thema, name: state.name, count: 1 };
          const result = await generateText(state.type!, formData);

          if (result && fieldConfig?.responseMapping) {
            const mappedData = fieldConfig.responseMapping(
              result as unknown as Record<string, unknown>
            );
            useImageStudioStore.getState().updateFormData(mappedData as Record<string, unknown>);

            const originalAlternative: SloganAlternative = fieldConfig.alternativesMapping
              ? fieldConfig.alternativesMapping(mappedData as Record<string, unknown>, 0)
              : (mappedData as SloganAlternative);
            useImageStudioStore.getState().setSloganAlternatives([originalAlternative]);

            setTimeout(() => {
              void fetchAlternativesInBackground(
                state.type!,
                formData,
                (alternatives) => {
                  const mappedAlternatives = fieldConfig.alternativesMapping
                    ? alternatives.map((alt, idx) =>
                        fieldConfig.alternativesMapping!(alt as Record<string, unknown>, idx + 1)
                      )
                    : alternatives;
                  useImageStudioStore.getState().setSloganAlternatives([originalAlternative, ...mappedAlternatives]);
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
    fieldConfig,
    fetchAiImageSuggestion,
    generateText,
    fetchAlternativesInBackground,
    setError,
    setPreloadedImageResult,
    setSlogansReady,
  ]);

  const goNext = useCallback(async (): Promise<boolean> => {
    if (isProcessing) {
      return false;
    }

    const step = currentStep;
    if (!step) {
      return false;
    }

    if (step.afterComplete === 'parallelPreload') {
      const success = await executeParallelPreload();
      if (!success) return false;
    }

    if (step.afterComplete === 'generateText') {
      const success = await executeTextGeneration();
      if (!success) return false;
    }

    if (step.afterComplete === 'backgroundRemoval') {
      const success = await executeBackgroundRemoval();
      if (!success) return false;
    }

    if (step.afterComplete === 'generateImage') {
      const success = typeConfig?.usesFluxApi
        ? await executeKiImageGeneration()
        : await executeTemplateImageGeneration();
      if (!success) return false;
      useImageStudioStore.getState().setCurrentStep(FORM_STEPS.RESULT);
      return true;
    }

    if (stepIndex < flowSteps.length - 1) {
      setDirection(1);
      setStepIndex((prev) => prev + 1);
      return true;
    }

    return false;
  }, [
    currentStep,
    stepIndex,
    flowSteps.length,
    isProcessing,
    typeConfig,
    executeTextGeneration,
    executeTemplateImageGeneration,
    executeKiImageGeneration,
    executeBackgroundRemoval,
    executeParallelPreload,
  ]);

  const goBack = useCallback((): boolean => {
    if (stepIndex > 0) {
      setDirection(-1);
      setStepIndex((prev) => prev - 1);
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
    const s = useImageStudioStore.getState();
    const values: Record<string, string> = {
      thema: s.thema,
      name: s.name,
      line1: s.line1,
      line2: s.line2,
      line3: s.line3,
      quote: s.quote,
      header: s.header,
      subheader: s.subheader,
      body: s.body,
      headline: s.headline,
      subtext: s.subtext,
      label: s.label,
      eventTitle: s.eventTitle,
      beschreibung: s.beschreibung,
      weekday: s.weekday,
      date: s.date,
      time: s.time,
      locationName: s.locationName,
      address: s.address,
      purePrompt: s.purePrompt,
      sharepicPrompt: s.sharepicPrompt,
      imagineTitle: s.imagineTitle,
      precisionInstruction: s.precisionInstruction,
      allyPlacement: s.allyPlacement || '',
    };
    return values[fieldName] || '';
  }, []);

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
    goBackToCanvas,
  };
};

export default useStepFlow;
