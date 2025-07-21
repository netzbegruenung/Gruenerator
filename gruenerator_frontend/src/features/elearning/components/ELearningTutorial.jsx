import React, { useEffect, useState } from 'react';
import { HiOutlineX, HiCheckCircle, HiArrowRight, HiArrowLeft } from 'react-icons/hi';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import BaseForm from '../../../components/common/Form/BaseForm/BaseForm';
import { useMultiStepForm } from '../../../components/common/Form/hooks';
import TutorialFormContent from './TutorialFormContent';
import TutorialDisplayContent from './TutorialDisplayContent';
import SubmitButton from '../../../components/common/SubmitButton';
import ProgressBar from '../../../components/common/ProgressBar/ProgressBar';

const ELearningTutorial = () => {
  const { user, isAuthenticated } = useOptimizedAuth();
  const { getBetaFeatureState } = useBetaFeatures();
  const [hasAccess, setHasAccess] = useState(false);
  const [formState, setFormState] = useState({ formData: { thema: '', details: '' }, isFormValid: false });
  const [loading, setLoading] = useState(false);
  
  // Multi-step form hook - 2 steps total (0: explanation, 1: interactive)
  const { currentStep, isFirstStep, isLastStep, next, back } = useMultiStepForm(2);

  useEffect(() => {
    if (isAuthenticated && user) {
      const elearningEnabled = getBetaFeatureState('e_learning');
      setHasAccess(elearningEnabled);
    }
  }, [isAuthenticated, user, getBetaFeatureState]);

  if (!isAuthenticated || !hasAccess) {
    return (
      <div className="tutorial-access-denied">
        <div className="access-denied-content">
          <HiOutlineX className="access-denied-icon" />
          <h2>Zugang nicht berechtigt</h2>
          <p>Du benötigst Zugang zum E-Learning Feature um dieses Tutorial zu sehen.</p>
          <button onClick={() => window.location.href = '/e-learning'} className="tutorial-button">
            Zurück zur Übersicht
          </button>
        </div>
      </div>
    );
  }

  // Handle form changes for real-time preview
  const handleFormChange = (newFormState) => {
    setFormState(newFormState);
  };

  // Mock submit handler for tutorial
  const handleMockSubmit = (formData) => {
    console.log('Mock form submitted (no real action):', formData);
    setLoading(true);
    setTimeout(() => setLoading(false), 1000);
  };

  // Generate dynamic content based on step and form state
  const dynamicContent = TutorialDisplayContent({
    currentStep,
    formData: formState.formData,
    isFormValid: formState.isFormValid
  });

  // Calculate progress percentage (0-100)
  const progressPercentage = ((currentStep + 1) / 2) * 100;

  // Step Navigation Component
  const StepNavigation = () => (
    <div className="tutorial-step-navigation">
      <div className="tutorial-navigation-buttons">
        {!isFirstStep && (
          <SubmitButton
            type="button"
            onClick={back}
            text="Zurück"
            icon={<HiArrowLeft />}
            loading={false}
            success={false}
            className="tutorial-nav-button tutorial-nav-button--secondary"
            ariaLabel="Zurück zum vorherigen Schritt"
          />
        )}
        {!isLastStep && (
          <SubmitButton
            type="button"
            onClick={next}
            text="Weiter"
            icon={<HiArrowRight />}
            loading={false}
            success={false}
            className="tutorial-nav-button tutorial-nav-button--primary"
            ariaLabel="Weiter zum nächsten Schritt"
          />
        )}
        {isLastStep && (
          <SubmitButton
            type="button"
            onClick={() => window.location.href = '/e-learning'}
            text="Tutorial beenden"
            icon={<HiCheckCircle />}
            loading={false}
            success={false}
            className="tutorial-nav-button tutorial-nav-button--primary"
            ariaLabel="Tutorial beenden und zur Übersicht zurückkehren"
          />
        )}
      </div>
      <ProgressBar 
        progress={progressPercentage}
        fixed={true}
        ariaLabel={`Tutorial Fortschritt: Schritt ${currentStep + 1} von 2`}
      />
    </div>
  );

  return (
    <div className="tutorial-clean-container">
      <BaseForm
        title={currentStep === 0 ? "Schritt 1: Lerne das Tool kennen" : "Universal Text Generator"}
        onSubmit={handleMockSubmit}
        loading={loading}
        success={false}
        generatedContent={dynamicContent}
        useMarkdown={true}
        componentName="tutorial"
        disableAutoCollapse={true}
        onFormChange={handleFormChange}
        submitConfig={{
          showButton: currentStep === 1 && formState.isFormValid,
          buttonText: "Text generieren",
          buttonProps: {
            className: "submit-button--enabled"
          }
        }}
        bottomSectionChildren={<StepNavigation />}
      >
        <TutorialFormContent 
          onFormChange={handleFormChange}
          currentStep={currentStep}
        />
      </BaseForm>
    </div>
  );
};

export default ELearningTutorial;