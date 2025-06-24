import React from 'react';
import { SharepicGeneratorProvider } from '../../../features/sharepic/core/utils/SharepicGeneratorContext';
// FormProvider removed - using generatedTextStore directly

const AppProviders = ({ children, withSharepic = false, pathname }) => {
  let wrapped = children;

  // FormProvider removed - no global form state needed anymore

  // Optional Sharepic Provider
  if (withSharepic) {
    wrapped = (
      <SharepicGeneratorProvider>
        {wrapped}
      </SharepicGeneratorProvider>
    );
  }

  return wrapped;
};

export default AppProviders;