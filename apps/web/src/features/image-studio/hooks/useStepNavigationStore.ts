import { create } from 'zustand';

import { FORM_STEPS, getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';

import type { NavigableStep, StepPosition, StepTrigger } from '../types/stepNavigation';

interface StepNavigationState {
  stepPosition: StepPosition | null;
  stepSequence: NavigableStep[];
  stepDirection: 'forward' | 'back';
  previousStepPosition: StepPosition | null;
  isStepProcessing: boolean;
  processingStepId: string | null;
}

interface StepNavigationActions {
  initStepSequence: (type: string) => void;
  stepNext: () => Promise<boolean>;
  stepBack: () => boolean;
  stepTo: (stepId: string) => void;
  getCurrentNavigableStep: () => NavigableStep | null;
  getStepIndex: () => number;
  isFirstStep: () => boolean;
  isLastStep: () => boolean;
  resetStepNavigation: () => void;
  setCurrentStepPhase: (phase: string) => void;
}

export type StepNavigationStore = StepNavigationState & StepNavigationActions;

const initialState: StepNavigationState = {
  stepPosition: null,
  stepSequence: [],
  stepDirection: 'forward',
  previousStepPosition: null,
  isStepProcessing: false,
  processingStepId: null,
};

export const useStepNavigationStore = create<StepNavigationStore>((set, get) => ({
  ...initialState,

  initStepSequence: (type: string) => {
    const typeConfig = getTypeConfig(type);
    const fieldConfig = getTemplateFieldConfig(type);
    if (!typeConfig || !fieldConfig) return;

    const steps: NavigableStep[] = [];
    const inputBeforeImage = typeConfig.inputBeforeImage ?? false;

    // Build input steps before image (if inputBeforeImage is true)
    if (inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach(
        (
          field: { name: string; label: string; subtitle?: string; helpText?: string },
          index: number
        ) => {
          const isLastInput = index === fieldConfig.inputFields.length - 1;
          const afterComplete: StepTrigger | null =
            isLastInput && typeConfig.parallelPreload ? 'parallelPreload' : null;

          steps.push({
            id: field.name,
            type: 'input',
            phase: FORM_STEPS.INPUT,
            field,
            stepTitle: field.label,
            stepSubtitle: field.subtitle || field.helpText || null,
            afterComplete,
          });
        }
      );
    }

    // Build image upload step (if requiresImage)
    if (typeConfig.requiresImage) {
      let imageUploadAfterComplete: StepTrigger | null = null;
      if (typeConfig.hasBackgroundRemoval) {
        imageUploadAfterComplete = 'backgroundRemoval';
      } else if (inputBeforeImage && !typeConfig.parallelPreload) {
        imageUploadAfterComplete = 'generateText';
      }

      const stepTitle = typeConfig.hasBackgroundRemoval ? 'Foto auswählen' : 'Bild auswählen';
      const stepSubtitle = typeConfig.hasBackgroundRemoval
        ? 'Wähle ein Porträtfoto aus'
        : 'Ziehe ein Bild hierher oder klicke zum Auswählen (JPG, PNG, WebP)';

      steps.push({
        id: 'image_upload',
        type: 'image_upload',
        phase: FORM_STEPS.IMAGE_UPLOAD,
        stepTitle,
        stepSubtitle,
        afterComplete: imageUploadAfterComplete,
      });

      // Add canvas edit step after image upload (if hasBackgroundRemoval)
      if (typeConfig.hasBackgroundRemoval) {
        steps.push({
          id: 'canvas_edit',
          type: 'canvas_edit',
          phase: FORM_STEPS.CANVAS_EDIT,
          stepTitle: 'Position anpassen',
          stepSubtitle: 'Ziehe und skaliere dein Bild',
          afterComplete: null,
        });
      }
    }

    // Build input steps after image (if inputBeforeImage is false)
    if (!inputBeforeImage && fieldConfig.inputFields?.length > 0) {
      fieldConfig.inputFields.forEach(
        (
          field: { name: string; label: string; subtitle?: string; helpText?: string },
          index: number
        ) => {
          const isLast = index === fieldConfig.inputFields.length - 1;
          let afterComplete: StepTrigger | null = null;

          if (isLast) {
            if (typeConfig.hasTextCanvasEdit) {
              afterComplete = 'generateText';
            } else {
              afterComplete = (fieldConfig.afterLastInputTrigger as StepTrigger) || 'generateImage';
            }
          }

          steps.push({
            id: field.name,
            type: 'input',
            phase: FORM_STEPS.INPUT,
            field,
            stepTitle: field.label,
            stepSubtitle: field.subtitle || field.helpText || null,
            afterComplete,
          });
        }
      );
    }

    // Add text canvas edit step (if hasTextGeneration and not using Flux API)
    if (typeConfig.hasTextGeneration && !typeConfig.usesFluxApi) {
      steps.push({
        id: 'text_canvas_edit',
        type: 'canvas_edit',
        phase: FORM_STEPS.CANVAS_EDIT,
        stepTitle: null,
        stepSubtitle: null,
        afterComplete: null,
      });
    }

    const firstStep = steps[0];
    set({
      stepSequence: steps,
      stepPosition: firstStep
        ? {
            phase: firstStep.phase,
            index: 0,
            stepId: firstStep.id,
          }
        : null,
      stepDirection: 'forward',
      previousStepPosition: null,
    });
  },

  stepNext: async () => {
    const { stepSequence, stepPosition } = get();
    if (!stepPosition) return false;

    const currentIndex = stepSequence.findIndex((s) => s.id === stepPosition.stepId);
    const currentStep = stepSequence[currentIndex];
    if (!currentStep) return false;

    set({ isStepProcessing: true, processingStepId: currentStep.id });

    try {
      if (currentIndex < stepSequence.length - 1) {
        const nextStep = stepSequence[currentIndex + 1];
        set({
          stepPosition: {
            phase: nextStep.phase,
            index: currentIndex + 1,
            stepId: nextStep.id,
          },
          stepDirection: 'forward',
          previousStepPosition: stepPosition,
        });
        return true;
      }
      return true;
    } finally {
      set({ isStepProcessing: false, processingStepId: null });
    }
  },

  stepBack: () => {
    const { stepSequence, stepPosition } = get();
    if (!stepPosition) return false;

    const currentIndex = stepSequence.findIndex((s) => s.id === stepPosition.stepId);
    if (currentIndex > 0) {
      const prevStep = stepSequence[currentIndex - 1];
      set({
        stepPosition: {
          phase: prevStep.phase,
          index: currentIndex - 1,
          stepId: prevStep.id,
        },
        stepDirection: 'back',
        previousStepPosition: stepPosition,
      });
      return true;
    }
    return false;
  },

  stepTo: (stepId: string) => {
    const { stepSequence, stepPosition } = get();
    const targetIndex = stepSequence.findIndex((s) => s.id === stepId);
    if (targetIndex < 0) return;

    const targetStep = stepSequence[targetIndex];
    const currentIndex = stepPosition
      ? stepSequence.findIndex((s) => s.id === stepPosition.stepId)
      : -1;

    set({
      stepPosition: {
        phase: targetStep.phase,
        index: targetIndex,
        stepId: targetStep.id,
      },
      stepDirection: targetIndex > currentIndex ? 'forward' : 'back',
      previousStepPosition: stepPosition,
    });
  },

  getCurrentNavigableStep: () => {
    const { stepSequence, stepPosition } = get();
    if (!stepPosition) return null;
    return stepSequence.find((s) => s.id === stepPosition.stepId) || null;
  },

  getStepIndex: () => {
    const { stepSequence, stepPosition } = get();
    if (!stepPosition) return 0;
    return stepSequence.findIndex((s) => s.id === stepPosition.stepId);
  },

  isFirstStep: () => get().getStepIndex() === 0,

  isLastStep: () => {
    const { stepSequence } = get();
    return get().getStepIndex() === stepSequence.length - 1;
  },

  resetStepNavigation: () => set(initialState),

  setCurrentStepPhase: () => {
    // This is a placeholder for syncing with imageStudioStore's currentStep
    // The actual sync will be handled at the component level
  },
}));

export default useStepNavigationStore;
