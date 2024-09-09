import { useState } from 'react';

export const useMultiStepForm = (stepCount) => {
  const [currentStep, setCurrentStep] = useState(0);

  const next = () => {
    console.log("Moving to next step");
    setCurrentStep((prevStep) => {
      const nextStep = Math.min(prevStep + 1, stepCount - 1);
      console.log("New step:", nextStep);
      return nextStep;
    });
  };

  const back = () => {
    console.log("Moving to previous step");
    setCurrentStep((prevStep) => {
      const prevStepValue = Math.max(prevStep - 1, 0);
      console.log("New step:", prevStepValue);
      return prevStepValue;
    });
  };

  return {
    currentStep,
    setCurrentStep,
    isFirstStep: currentStep === 0,
    isLastStep: currentStep === stepCount - 1,
    next,
    back
  };
};