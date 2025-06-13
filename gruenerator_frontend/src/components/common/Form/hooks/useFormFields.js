import React from 'react';
import { useFormContext } from 'react-hook-form';
import { FormInput, FormTextarea, FormAutoInput, FormSelect, FormCheckbox } from '../Input';

/**
 * Custom hook that provides form components with automatic control binding
 * Simplifies form development by providing pre-bound components
 * @returns {Object} Form components with control automatically bound
 */
export const useFormFields = () => {
  let ctxControl = null;
  try {
    const formContext = useFormContext();
    ctxControl = formContext.control;
  } catch (error) {
    // No RHF context available
  }

  // helper to bind component
  const bind = (Cmp) => ({ control, ...rest }) =>
    React.createElement(Cmp, { control: control || ctxControl, ...rest });

  return {
    Input: bind(FormInput),
    Textarea: bind(FormTextarea),
    AutoInput: bind(FormAutoInput),
    Select: bind(FormSelect),
    Checkbox: bind(FormCheckbox)
  };
};

export default useFormFields; 