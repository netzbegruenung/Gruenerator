import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react';
import React, { useCallback, useMemo, useState, useEffect } from 'react';

import { StatusBadge } from '../../../components/common/StatusBadge';
import ErrorBoundary from '../../../components/ErrorBoundary';
import useImageGenerationLimit from '../../../hooks/useImageGenerationLimit';
import useImageStudioStore from '../../../stores/imageStudioStore';
import StepFlow from '../components/StepFlow';
import { useFontPreload } from '../hooks/useFontPreload';
import { useImageGeneration } from '../hooks/useImageGeneration';
import TemplateResultStep from '../steps/TemplateResultStep';
import { FORM_STEPS, getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';

import './TemplateStudioFlow.css';

/**
 * TemplateStudioFlow - Unified flow for both template and KI image creation
 * Uses StepFlow for INPUT, then TemplateResultStep for RESULT
 */
interface TemplateStudioFlowProps {
  onBack: () => void;
}

const TemplateStudioFlow = ({ onBack }: TemplateStudioFlowProps) => {
  const {
    currentStep,
    setCurrentStep,
    previousStep,
    navigationDirection,
    setIsAnimating,
    type,
    flowTitle,
    flowSubtitle,
    // Template fields
    line1,
    line2,
    line3,
    quote,
    name,
    header,
    subheader,
    body,
    uploadedImage,
    selectedImage,
    fontSize,
    colorScheme,
    balkenOffset,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    // KI fields
    purePrompt,
    sharepicPrompt,
    imagineTitle,
    variant,
    precisionInstruction,
    precisionMode,
    selectedInfrastructure,
    allyPlacement,
    setGeneratedImage,
  } = useImageStudioStore();

  // Preload fonts early - as soon as we know the type
  useFontPreload(type);

  const shouldReduceMotion = useReducedMotion();
  const isGoingBack = navigationDirection === 'back';
  const isUploadToInput =
    previousStep === FORM_STEPS.IMAGE_UPLOAD && currentStep === FORM_STEPS.INPUT;

  const [isWideStep, setIsWideStep] = useState(false);

  const handleStepChange = useCallback((stepType: string) => {
    setIsWideStep(stepType === 'image_upload');
  }, []);

  const handleAnimationStart = useCallback(() => {
    setIsAnimating(true);
  }, [setIsAnimating]);

  const handleAnimationComplete = useCallback(() => {
    setIsAnimating(false);
  }, [setIsAnimating]);

  const stepVariants = {
    enter: { opacity: isGoingBack ? 1 : 0, scale: isUploadToInput ? 0.98 : 1 },
    center: { opacity: 1, scale: 1 },
    exit: { opacity: isGoingBack ? 1 : 0, scale: isUploadToInput ? 0.98 : 1 },
  };

  const stepTransition =
    shouldReduceMotion || isGoingBack
      ? { duration: 0 }
      : {
          type: 'tween' as const,
          ease: 'easeOut' as const,
          duration: isUploadToInput ? 0.4 : 0.25,
        };

  const typeConfig = useMemo(() => getTypeConfig(type || ''), [type]);
  const fieldConfig = useMemo(() => getTemplateFieldConfig(type || ''), [type]);

  const { generateImage, loading, error, setError } = useImageGeneration();
  const { data: imageLimitData, refetch: refetchImageLimit } = useImageGenerationLimit();

  const handleGoBackToCanvas = useCallback(() => {
    setCurrentStep(FORM_STEPS.CANVAS_EDIT);
  }, [setCurrentStep]);

  const handleImageRegenerate = useCallback(async () => {
    setError('');

    try {
      let image;

      if (typeConfig?.usesFluxApi) {
        // KI regeneration
        const formData = {
          purePrompt,
          sharepicPrompt,
          imagineTitle,
          variant,
          uploadedImage,
          precisionMode: typeConfig?.alwaysPrecision || precisionMode,
          precisionInstruction,
          selectedInfrastructure,
          allyPlacement,
        };

        image = await generateImage(type!, formData);
        refetchImageLimit();
      } else {
        // Template regeneration
        const formData: Record<string, unknown> = {
          type: typeConfig?.legacyType || type,
          line1,
          line2,
          line3,
          quote,
          name,
          header,
          subheader,
          body,
          uploadedImage: uploadedImage || selectedImage,
          fontSize,
          colorScheme,
          balkenOffset,
          balkenGruppenOffset,
          sunflowerOffset,
          credit,
        };

        image = await generateImage(type!, formData);
      }

      setGeneratedImage(image);

      // Commit to AI Editor history if type has the feature enabled
      if (typeConfig?.hasAiEditor) {
        const { commitAiGeneration } = useImageStudioStore.getState();

        // Use appropriate prompt field based on type
        // Edit types use precisionInstruction, AI_EDITOR uses purePrompt
        const prompt = precisionInstruction || purePrompt || sharepicPrompt || '';

        commitAiGeneration(image, prompt);
      }
    } catch (err) {
      console.error('[TemplateStudioFlow] Image regeneration error:', err);
    }
  }, [
    type,
    typeConfig,
    // Template deps
    line1,
    line2,
    line3,
    quote,
    name,
    header,
    subheader,
    body,
    uploadedImage,
    selectedImage,
    fontSize,
    colorScheme,
    balkenOffset,
    balkenGruppenOffset,
    sunflowerOffset,
    credit,
    // KI deps
    purePrompt,
    sharepicPrompt,
    imagineTitle,
    variant,
    precisionMode,
    precisionInstruction,
    selectedInfrastructure,
    allyPlacement,
    generateImage,
    setGeneratedImage,
    setError,
    refetchImageLimit,
  ]);

  if (!fieldConfig) {
    return <div className="error-message">Konfiguration für diesen Typ nicht gefunden.</div>;
  }

  return (
    <ErrorBoundary>
      <LayoutGroup>
        <div className="type-selector-screen">
          <div className="type-selector-content">
            {flowTitle && (
              <div className="template-studio-flow-header">
                <h1>
                  {flowTitle}
                  <StatusBadge type="early-access" variant="inline" />
                </h1>
                {flowSubtitle && <p className="flow-subtitle">{flowSubtitle}</p>}
              </div>
            )}

            <div
              className={`template-studio-flow${isWideStep ? ' template-studio-flow--wide' : ''}`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  variants={stepVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={stepTransition}
                  className="template-studio-flow__step"
                  onAnimationStart={handleAnimationStart}
                  onAnimationComplete={handleAnimationComplete}
                >
                  {(() => {
                    const shouldRenderStepFlow =
                      currentStep === FORM_STEPS.IMAGE_UPLOAD ||
                      currentStep === FORM_STEPS.INPUT ||
                      currentStep === FORM_STEPS.IMAGE_SIZE_SELECT ||
                      currentStep === FORM_STEPS.CANVAS_EDIT;
                    return shouldRenderStepFlow ? (
                      <StepFlow
                        onBack={onBack}
                        onComplete={() => setCurrentStep(FORM_STEPS.RESULT)}
                        onStepChange={handleStepChange}
                        imageLimitData={typeConfig?.hasRateLimit ? imageLimitData : null}
                        startAtCanvasEdit={currentStep === FORM_STEPS.CANVAS_EDIT}
                      />
                    ) : null;
                  })()}

                  {currentStep === FORM_STEPS.RESULT && (
                    <TemplateResultStep
                      onRegenerate={handleImageRegenerate}
                      loading={loading}
                      onGoBackToCanvas={
                        typeConfig?.hasBackgroundRemoval ? handleGoBackToCanvas : undefined
                      }
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </LayoutGroup>
    </ErrorBoundary>
  );
};

export default TemplateStudioFlow;
