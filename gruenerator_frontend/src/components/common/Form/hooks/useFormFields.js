import React from 'react';
import { useFormContext } from 'react-hook-form';
import { FormInput, FormTextarea, FormAutoInput, FormSelect, FormCheckbox } from '../Input';

/**
 * Custom hook that provides form components with automatic control binding
 * Simplifies form development by providing pre-bound components
 * @returns {Object} Form components with control automatically bound
 */
export const useFormFields = () => {
  let control = null;
  
  try {
    const formContext = useFormContext();
    control = formContext.control;
  } catch (error) {
    // No FormContext available - components will work in legacy mode
    console.warn('[useFormFields] No FormContext available, using legacy mode');
  }

  return {
    Input: (props) => React.createElement(FormInput, { control, ...props }),
    Textarea: (props) => React.createElement(FormTextarea, { control, ...props }),
    AutoInput: (props) => React.createElement(FormAutoInput, { control, ...props }),
    Select: (props) => React.createElement(FormSelect, { control, ...props }),
    Checkbox: (props) => React.createElement(FormCheckbox, { control, ...props })
  };
};

export default useFormFields; 