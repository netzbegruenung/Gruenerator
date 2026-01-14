import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useStepFlow } from '../hooks/useStepFlow';
import { useDraftAutoSave } from '../hooks/useDraftAutoSave';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import '../../../assets/styles/components/image-studio/typeform-fields.css';

// Import extracted steps
import InputStep from '../steps/InputStep';
import ImageUploadStep from '../steps/ImageUploadStep';
import ImageSizeSelectStep from '../steps/ImageSizeSelectStep';
import CanvasEditStep from '../steps/CanvasEditStep';

// Types (Keep StepFlowProps, but maybe move others if needed by steps)
import { IMAGE_STUDIO_TYPES } from '../utils/typeConfig';

export interface StepFlowProps {
  onBack?: () => void;
  onComplete?: () => void;
  onStepChange?: (stepType: string) => void;
  imageLimitData?: {
    count: number;
    canGenerate: boolean;
  } | null;
  startAtCanvasEdit?: boolean;
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
    opacity: 0
  }),
  center: {
    y: 0,
    opacity: 1
  },
  exit: (direction: AnimationDirection) => ({
    y: direction < 0 ? 40 : -40,
    opacity: 0
  })
};

const StepFlow: React.FC<StepFlowProps> = ({ onBack: parentOnBack, onComplete, onStepChange, imageLimitData, startAtCanvasEdit }) => {
  const { handleChange, updateFormData, name, sloganAlternatives, uploadedImage } = useImageStudioStore();
  const { user } = useOptimizedAuth();

  const {
    stepIndex,
    direction,
    currentStep,
    flowSteps,
    isFirstStep,
    loading,
    error,
    goNext,
    goBack,
    getFieldValue,
    transparentImage,
    typeConfig,
    handleCanvasExport,
    handleCanvasSave,
    bgRemovalProgress
  } = useStepFlow({ startAtCanvasEdit });

  // Initialize auto-save behavior
  useDraftAutoSave();

  const userDisplayName = useMemo(() => {
    const displayName = user?.display_name || user?.name || '';
    return displayName.trim();
  }, [user]);

  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (uploadedImage) {
      if (typeof uploadedImage === 'string') {
        setUploadedImageUrl(uploadedImage);
        return;
      }
      const url = URL.createObjectURL(uploadedImage);
      setUploadedImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setUploadedImageUrl(null);
  }, [uploadedImage]);

  useEffect(() => {
    if (!name && userDisplayName) {
      updateFormData({ name: userDisplayName });
    }
  }, [userDisplayName]);

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
  const isLastInputStep = currentStep?.type === 'input' && (
    currentStep?.afterComplete === 'generateText' ||
    currentStep?.afterComplete === 'generateImage' ||
    currentStep?.afterComplete === 'parallelPreload'
  );

  if (!currentStep) {
    return null;
  }

  return (
    <div className="typeform-container">
      <div className="typeform-content">
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
              value={getFieldValue((currentStep as InputStepData).field?.name ?? '')}
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
            <CanvasEditStep
              typeConfig={typeConfig ?? undefined}
              uploadedImageUrl={uploadedImageUrl}
              sloganAlternatives={sloganAlternatives}
              getFieldValue={getFieldValue}
              handleCanvasExport={handleCanvasExport}
              handleCanvasSave={handleCanvasSave}
              handleBack={handleBack}
              transparentImage={transparentImage}
              currentStepId={currentStep.id}
              direction={direction}
              onHeadlineChange={(headline) => updateFormData({ headline })}
              onSubtextChange={(subtext) => updateFormData({ subtext })}
            />
          )}
        </AnimatePresence>

        {imageLimitData && imageLimitData.count >= 8 && (
          <div className={`image-limit-indicator ${!imageLimitData.canGenerate ? 'image-limit-indicator--blocked' : ''}`}>
            <span className="image-limit-indicator__text">
              {imageLimitData.count}/10 Bilder heute
            </span>
            {!imageLimitData.canGenerate && (
              <span className="image-limit-indicator__blocked">
                Tageslimit erreicht
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StepFlow;
