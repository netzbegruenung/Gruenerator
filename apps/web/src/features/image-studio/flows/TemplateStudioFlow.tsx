import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { StatusBadge } from '../../../components/common/StatusBadge';
import ErrorBoundary from '../../../components/ErrorBoundary';
import useImageGenerationLimit from '../../../hooks/useImageGenerationLimit';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { cn } from '../../../utils/cn';
import StepFlow from '../components/StepFlow';
import { useImageGeneration } from '../hooks/useImageGeneration';
import { SharepicResearchPreviewBanner } from '../researchPreviewWarning';
import { mintCanvasFromStudioStore } from '../services/canvasMintService';
import TemplateResultStep from '../steps/TemplateResultStep';
import { FORM_STEPS, getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';
import { WebCanvasEditorProvider } from '../WebCanvasEditorProvider';

interface TemplateStudioFlowProps {
  onBack: () => void;
}

const TemplateStudioFlow = ({ onBack }: TemplateStudioFlowProps) => {
  const { currentStep, previousStep, navigationDirection, type, flowTitle, flowSubtitle } =
    useImageStudioStore(
      useShallow((s) => ({
        currentStep: s.currentStep,
        previousStep: s.previousStep,
        navigationDirection: s.navigationDirection,
        type: s.type,
        flowTitle: s.flowTitle,
        flowSubtitle: s.flowSubtitle,
      }))
    );

  const shouldReduceMotion = useReducedMotion();
  const isGoingBack = navigationDirection === 'back';
  const isUploadToInput =
    previousStep === FORM_STEPS.IMAGE_UPLOAD && currentStep === FORM_STEPS.INPUT;

  const [isWideStep, setIsWideStep] = useState(false);
  const [mintError, setMintError] = useState(false);

  const handleStepChange = useCallback((stepType: string) => {
    setIsWideStep(stepType === 'image_upload');
  }, []);

  const navigate = useNavigate();
  const mintingRef = useRef(false);

  // Reaching CANVAS_EDIT mints a canvas document and navigates to the
  // collaborative /studio/canvas/:id route. Extracted so the failure UI can
  // retry it. mintingRef guards against concurrent/duplicate mints.
  const runMint = useCallback(async () => {
    if (mintingRef.current) return;
    if (!type) return;

    mintingRef.current = true;
    setMintError(false);
    try {
      const state = useImageStudioStore.getState();
      const { id } = await mintCanvasFromStudioStore(state);
      void navigate(`/studio/canvas/${id}`, { replace: true });
    } catch (err) {
      console.error('[TemplateStudioFlow] Canvas mint failed:', err);
      void import('sonner').then(({ toast }) =>
        toast.error('Leinwand konnte nicht gespeichert werden. Bitte erneut versuchen.')
      );
      mintingRef.current = false;
      setMintError(true);
    }
  }, [type, navigate]);

  useEffect(() => {
    if (currentStep !== FORM_STEPS.CANVAS_EDIT) return;
    void runMint();
  }, [currentStep, runMint]);

  const handleAnimationStart = useCallback(() => {
    useImageStudioStore.getState().setIsAnimating(true);
  }, []);

  const handleAnimationComplete = useCallback(() => {
    useImageStudioStore.getState().setIsAnimating(false);
  }, []);

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
    useImageStudioStore.getState().setCurrentStep(FORM_STEPS.CANVAS_EDIT);
  }, []);

  const handleImageRegenerate = useCallback(async () => {
    setError('');

    try {
      const state = useImageStudioStore.getState();
      let image;

      if (typeConfig?.usesFluxApi) {
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

        image = await generateImage(state.type!, formData);
        void refetchImageLimit();
      } else {
        const formData: Record<string, unknown> = {
          type: typeConfig?.legacyType || state.type,
          line1: state.line1,
          line2: state.line2,
          line3: state.line3,
          quote: state.quote,
          name: state.name,
          header: state.header,
          subheader: state.subheader,
          body: state.body,
          uploadedImage: state.uploadedImage || state.selectedImage,
          fontSize: state.fontSize,
          colorScheme: state.colorScheme,
          balkenOffset: state.balkenOffset,
          balkenGruppenOffset: state.balkenGruppenOffset,
          sunflowerOffset: state.sunflowerOffset,
          credit: state.credit,
        };

        image = await generateImage(state.type!, formData);
      }

      state.setGeneratedImage(image);

      if (typeConfig?.hasAiEditor) {
        const prompt = state.precisionInstruction || state.purePrompt || state.sharepicPrompt || '';
        state.commitAiGeneration(image, prompt);
      }
    } catch (err) {
      console.error('[TemplateStudioFlow] Image regeneration error:', err);
    }
  }, [typeConfig, generateImage, setError, refetchImageLimit]);

  if (!fieldConfig) {
    return <div className="error-message">Konfiguration für diesen Typ nicht gefunden.</div>;
  }

  // CANVAS_EDIT is the mint→navigate handoff. While minting (or in the brief
  // window before the effect runs) show a loader; on failure show an explicit
  // retry/back instead of a dead-end blank screen.
  if (currentStep === FORM_STEPS.CANVAS_EDIT) {
    if (mintError) {
      return (
        <div className="flex h-[60vh] flex-col items-center justify-center gap-md text-center text-foreground">
          <p className="text-sm text-grey-600 dark:text-grey-300">
            Leinwand konnte nicht vorbereitet werden.
          </p>
          <div className="flex items-center gap-sm">
            <button
              type="button"
              onClick={() => void runMint()}
              className="rounded-md bg-primary-500 px-4 py-2 text-sm text-white hover:bg-primary-600"
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              onClick={onBack}
              className="rounded-md border border-grey-200 px-4 py-2 text-sm hover:bg-grey-100 dark:border-grey-700 dark:hover:bg-grey-800"
            >
              Zurück
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-[60vh] items-center justify-center gap-sm text-foreground">
        <div className="size-4 animate-spin rounded-full border-2 border-grey-200 border-t-primary-500" />
        <span className="text-sm">Leinwand wird vorbereitet…</span>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <WebCanvasEditorProvider>
        <LayoutGroup>
          <div className="w-full flex justify-center p-8 max-[768px]:p-4">
            <div className="w-full max-w-[var(--container-max-width)] mx-auto px-6 pb-16 text-center max-[768px]:px-4">
              <SharepicResearchPreviewBanner className="mb-lg text-left" />
              {flowTitle && (
                <div className="flex flex-col mb-lg">
                  <h1 className="flex items-center justify-center gap-sm flex-wrap">
                    {flowTitle}
                    <StatusBadge type="early-access" variant="inline" />
                  </h1>
                  {flowSubtitle && (
                    <p className="text-base text-grey-500 mt-sm mb-0 leading-snug text-center max-[768px]:text-[0.9rem]">
                      {flowSubtitle}
                    </p>
                  )}
                </div>
              )}

              <div
                className={cn(
                  'relative w-full max-w-[700px] mx-auto min-[1200px]:max-w-[900px] max-[768px]:p-0',
                  isWideStep &&
                    'max-w-[1000px] min-[1200px]:max-w-[1200px] min-[1400px]:max-w-[1400px]'
                )}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={stepTransition}
                    className="w-full"
                    onAnimationStart={handleAnimationStart}
                    onAnimationComplete={handleAnimationComplete}
                  >
                    {(() => {
                      // CANVAS_EDIT is intentionally excluded: reaching it triggers
                      // the mint effect above, which shows the minting loader and
                      // navigates to the collaborative /studio/canvas/:id route.
                      const shouldRenderStepFlow =
                        currentStep === FORM_STEPS.IMAGE_UPLOAD ||
                        currentStep === FORM_STEPS.INPUT ||
                        currentStep === FORM_STEPS.IMAGE_SIZE_SELECT;
                      return shouldRenderStepFlow ? (
                        <StepFlow
                          onBack={onBack}
                          onStepChange={handleStepChange}
                          imageLimitData={typeConfig?.hasRateLimit ? imageLimitData : null}
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
      </WebCanvasEditorProvider>
    </ErrorBoundary>
  );
};

export default TemplateStudioFlow;
