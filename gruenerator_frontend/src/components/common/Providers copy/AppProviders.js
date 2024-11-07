import React from 'react';
import PropTypes from 'prop-types';
import { FormProvider } from '../../../utils/FormContext';
import { SharepicGeneratorProvider } from '../../../utils/Sharepic/SharepicGeneratorContext';
import ErrorBoundary from '../../ErrorBoundary';

const AppProviders = ({ 
  children, 
  pathname, 
  withSharepic = false,
  withForm = false 
}) => {
  const content = withForm ? (
    <FormProvider key={`form-${pathname}`}>
      {children}
    </FormProvider>
  ) : children;

  if (withSharepic) {
    return (
      <ErrorBoundary>
        <SharepicGeneratorProvider>
          {content}
        </SharepicGeneratorProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {content}
    </ErrorBoundary>
  );
};

AppProviders.propTypes = {
  children: PropTypes.node.isRequired,
  pathname: PropTypes.string.isRequired,
  withSharepic: PropTypes.bool,
  withForm: PropTypes.bool
};

export default AppProviders; 