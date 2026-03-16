import React, { type ComponentType } from 'react';
import { type Control, useFormContext } from 'react-hook-form';

import { FormAutoInput, FormCheckbox, FormInput, FormSelect, FormTextarea } from '../Input';

/**
 * Custom hook that provides form components with automatic control binding
 * Simplifies form development by providing pre-bound components
 */
export const useFormFields = () => {
  let ctxControl: Control | null = null;
  try {
    const formContext = useFormContext();
    ctxControl = formContext.control;
  } catch (error) {
    // No RHF context available
  }

  // helper to bind component
  const bind =
    (Cmp: ComponentType<{ control?: Control | null } & Record<string, unknown>>) =>
    ({ control, ...rest }: { control?: Control | null } & Record<string, unknown>) =>
      React.createElement(Cmp, { control: control || ctxControl, ...rest });

  return {
    Input: bind(FormInput),
    Textarea: bind(FormTextarea),
    AutoInput: bind(FormAutoInput),
    Select: bind(FormSelect),
    Checkbox: bind(FormCheckbox),
  };
};

export default useFormFields;
