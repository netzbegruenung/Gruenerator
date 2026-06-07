import { AnimatePresence } from 'motion/react';
import React, { useEffect, useCallback, useMemo } from 'react';

import { useAuthStore } from '../../../stores/authStore';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useDraftAutoSave } from '../hooks/useDraftAutoSave';
import { useStepFlow } from '../hooks/useStepFlow';

// Import extracted steps
import ImageSizeSelectStep from '../steps/ImageSizeSelectStep';
import ImageUploadStep from '../steps/ImageUploadStep';
import InputStep from '../steps/InputStep';

// Types (Keep StepFlowProps, but maybe move others if needed by steps)

export interface StepFlowProps {
  onBack?: () => void;
  onStepChange?: (stepType: string) => void;
  imageLimitData?: {
    count: number;
    canGenerate: boolean;
  } | null;
}

export type AnimationDirection = number;

interface InputStepField {
  name: string;
  label: string;
  subtitle?: string;
  helpText?: string;
}

interface InputStepData {
  id: string;
  type: 'input';
  field?: InputStepField;
}

export const slideVariants = {
  enter: (direction: AnimationDirection) => ({
    y: direction > 0 ? 40 : -40,
    opacity: 0,
  }),
  center: {
    y: 0,
    opacity: 1,
  },
  exit: (direction: AnimationDirection) => ({
    y: direction < 0 ? 40 : -40,
    opacity: 0,
  }),
};

const StepFlow: React.FC<StepFlowProps> = ({
  onBack: parentOnBack,
  onStepChange,
  imageLimitData,
}) => {
  const handleChange = useImageStudioStore((s) => s.handleChange);
  const updateFormData = useImageStudioStore((s) => s.updateFormData);
  const user = useAuthStore((s) => s.user);

  const {
    direction,
    currentStep,
    isFirstStep,
    loading,
    error,
    goNext,
    goBack,
    bgRemovalProgress,
  } = useStepFlow();

  // Initialize auto-save behavior
  useDraftAutoSave();

  const userDisplayName = useMemo(() => {
    const displayName = user?.display_name || '';
    return displayName.trim();
  }, [user]);

  useEffect(() => {
    if (!useImageStudioStore.getState().name && userDisplayName) {
      updateFormData({ name: userDisplayName });
    }
  }, [userDisplayName, updateFormData]);

  useEffect(() => {
    onStepChange?.(currentStep?.type || '');
  }, [currentStep?.type, onStepChange]);

  const handleBack = useCallback(() => {
    if (isFirstStep) {
      parentOnBack?.();
    } else {
      goBack();
    }
  }, [isFirstStep, parentOnBack, goBack]);

  const handleNext = useCallback(async () => {
    await goNext();
  }, [goNext]);

  // For template types: last input is before slogan step
  // For KI types: last input triggers image generation directly (afterComplete === 'generateImage')
  // For parallelPreload types: last input triggers parallel loading
  const isLastInputStep =
    currentStep?.type === 'input' &&
    (currentStep?.afterComplete === 'generateText' ||
      currentStep?.afterComplete === 'generateImage' ||
      currentStep?.afterComplete === 'parallelPreload');

  if (!currentStep) {
    return null;
  }

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-[700px] mx-auto flex flex-col gap-md p-md max-[768px]:p-xs">
        <AnimatePresence mode="wait" custom={direction}>
          {currentStep.type === 'image_upload' && (
            <ImageUploadStep
              key={currentStep.id}
              onNext={handleNext}
              onBack={handleBack}
              direction={direction}
              loading={loading}
              bgRemovalProgress={bgRemovalProgress}
            />
          )}

          {currentStep.type === 'image_size_select' && (
            <ImageSizeSelectStep
              key={currentStep.id}
              onNext={handleNext}
              onBack={handleBack}
              direction={direction}
              loading={loading}
            />
          )}

          {currentStep.type === 'input' && (
            <InputStep
              key={currentStep.id}
              field={(currentStep as InputStepData).field}
              onChange={handleChange}
              onNext={handleNext}
              onBack={handleBack}
              isLastInput={isLastInputStep || false}
              loading={loading}
              error={error}
              direction={direction}
            />
          )}

          {currentStep.type === 'canvas_edit' && (
            // Canvas editing has moved to the collaborative `/studio/canvas/:id`
            // route. Reaching this step hands off via the store (see useStepFlow);
            // this brief loader shows until TemplateStudioFlow mints and navigates.
            <div
              key={currentStep.id}
              className="flex items-center justify-center gap-sm py-2xl text-foreground"
            >
              <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
              <span className="text-sm">Leinwand wird vorbereitet…</span>
            </div>
          )}
        </AnimatePresence>

        {imageLimitData && imageLimitData.count >= 8 && (
          <div
            className={`image-limit-indicator ${!imageLimitData.canGenerate ? 'image-limit-indicator--blocked' : ''}`}
          >
            <span className="image-limit-indicator__text">
              {imageLimitData.count}/10 Bilder heute
            </span>
            {!imageLimitData.canGenerate && (
              <span className="image-limit-indicator__blocked">Tageslimit erreicht</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StepFlow;
