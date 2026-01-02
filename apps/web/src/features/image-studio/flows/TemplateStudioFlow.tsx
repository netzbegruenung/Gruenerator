import React, { useCallback, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useImageGeneration } from '../hooks/useImageGeneration';
import useImageGenerationLimit from '../../../hooks/useImageGenerationLimit';
import {
  FORM_STEPS,
  getTypeConfig,
  getTemplateFieldConfig
} from '../utils/typeConfig';
import StepFlow from '../components/StepFlow';
import TemplateResultStep from '../steps/TemplateResultStep';
import ErrorBoundary from '../../../components/ErrorBoundary';

import './TemplateStudioFlow.css';

/**
 * TemplateStudioFlow - Unified flow for both template and KI image creation
 * Uses StepFlow for INPUT, then TemplateResultStep for RESULT
 */
const TemplateStudioFlow = ({ onBack }) => {
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
    line1, line2, line3,
    quote, name,
    header, subheader, body,
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
    setGeneratedImage
  } = useImageStudioStore();

  const shouldReduceMotion = useReducedMotion();
  const isGoingBack = navigationDirection === 'back';
  const isUploadToInput = previousStep === FORM_STEPS.IMAGE_UPLOAD && currentStep === FORM_STEPS.INPUT;

  const handleAnimationStart = useCallback(() => {
    setIsAnimating(true);
  }, [setIsAnimating]);

  const handleAnimationComplete = useCallback(() => {
    setIsAnimating(false);
  }, [setIsAnimating]);

  const stepVariants = {
    enter: { opacity: isGoingBack ? 1 : 0, scale: isUploadToInput ? 0.98 : 1 },
    center: { opacity: 1, scale: 1 },
    exit: { opacity: isGoingBack ? 1 : 0, scale: isUploadToInput ? 0.98 : 1 }
  };

  const stepTransition = (shouldReduceMotion || isGoingBack)
    ? { duration: 0 }
    : { type: 'tween' as const, ease: 'easeOut' as const, duration: isUploadToInput ? 0.4 : 0.25 };

  const typeConfig = useMemo(() => getTypeConfig(type), [type]);
  const fieldConfig = useMemo(() => getTemplateFieldConfig(type), [type]);

  const { generateImage, loading, error, setError } = useImageGeneration();
  const { data: imageLimitData, refetch: refetchImageLimit } = useImageGenerationLimit();

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
          allyPlacement
        };

        image = await generateImage(type, formData);
        refetchImageLimit();
      } else {
        // Template regeneration
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
          credit
        };

        image = await generateImage(type, formData);
      }

      setGeneratedImage(image);
    } catch (err) {
      console.error('[TemplateStudioFlow] Image regeneration error:', err);
    }
  }, [
    type, typeConfig,
    // Template deps
    line1, line2, line3, quote, name,
    header, subheader, body,
    uploadedImage, selectedImage,
    fontSize, colorScheme, balkenOffset,
    balkenGruppenOffset, sunflowerOffset, credit,
    // KI deps
    purePrompt, sharepicPrompt, imagineTitle, variant,
    precisionMode, precisionInstruction, selectedInfrastructure, allyPlacement,
    generateImage, setGeneratedImage, setError, refetchImageLimit
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
                <h1>{flowTitle}</h1>
                {flowSubtitle && (
                  <p className="flow-subtitle">{flowSubtitle}</p>
                )}
              </div>
            )}

            <div className="template-studio-flow">
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
                  {currentStep === FORM_STEPS.INPUT && (
                    <StepFlow
                      onBack={onBack}
                      onComplete={() => setCurrentStep(FORM_STEPS.RESULT)}
                      imageLimitData={typeConfig?.hasRateLimit ? imageLimitData : null}
                    />
                  )}

                  {currentStep === FORM_STEPS.RESULT && (
                    <TemplateResultStep
                      onRegenerate={handleImageRegenerate}
                      loading={loading}
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
