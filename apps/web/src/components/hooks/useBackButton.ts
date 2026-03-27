// useBackButton.ts
import { type Dispatch, type SetStateAction, useCallback } from 'react';

export const useBackButton = (
  currentStep: number,
  setCurrentStep: Dispatch<SetStateAction<number>>
): { handleBack: () => void; showBackButton: boolean } => {
  const handleBack = useCallback(() => {
    setCurrentStep((prevStep) => Math.max(0, prevStep - 1));
  }, [setCurrentStep]);

  const showBackButton = currentStep > 0;

  return { handleBack, showBackButton };
};
