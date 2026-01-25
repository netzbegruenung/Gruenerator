// useBackButton.js
import { useCallback } from 'react';

export const useBackButton = (currentStep, setCurrentStep) => {
  const handleBack = useCallback(() => {
    setCurrentStep((prevStep) => Math.max(0, prevStep - 1));
  }, [setCurrentStep]);

  const showBackButton = currentStep > 0;

  return { handleBack, showBackButton };
};
