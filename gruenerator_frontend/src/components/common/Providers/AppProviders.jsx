import React from 'react';
// SharepicGeneratorProvider removed - using useSharepicStore directly
// FormProvider removed - using generatedTextStore directly

const AppProviders = ({ children, withSharepic = false, pathname }) => {
  let wrapped = children;

  // FormProvider removed - no global form state needed anymore
  // SharepicGeneratorProvider removed - using Zustand store directly

  return wrapped;
};

export default AppProviders;