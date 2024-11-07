import React from 'react';
import { SharepicGeneratorProvider } from '../../utils/Sharepic/SharepicGeneratorContext';
import { FormProvider } from '../../utils/FormContext';

const AppProviders = ({ children, withSharepic = false, pathname }) => {
  let wrapped = children;

  // Form Provider wrapping
  wrapped = (
    <FormProvider key={`form-${pathname}`}>
      {wrapped}
    </FormProvider>
  );

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