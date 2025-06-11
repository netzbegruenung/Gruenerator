import React from 'react';
import { SharepicGeneratorProvider } from '../../../features/sharepic/core/utils/SharepicGeneratorContext';
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