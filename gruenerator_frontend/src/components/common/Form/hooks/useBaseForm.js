import { useForm } from 'react-hook-form';
import { useCallback } from 'react';

/**
 * Simplified BaseForm Hook für react-hook-form Integration
 * Dünner Wrapper um useForm mit einigen Utility-Funktionen
 * @param {Object} config - Hook-Konfiguration
 * @returns {Object} Form-Funktionen und Zustand
 */
const useBaseForm = ({
  defaultValues = {},
  mode = 'onChange',
  reValidateMode = 'onChange',
  criteriaMode = 'firstError',
  shouldFocusError = true,
  shouldUnregister = false,
  shouldUseNativeValidation = false,
  delayError = undefined,
  ...restOptions
} = {}) => {
  
  // React-Hook-Form Initialization
  const hookFormMethods = useForm({
    defaultValues,
    mode,
    reValidateMode,
    criteriaMode,
    shouldFocusError,
    shouldUnregister,
    shouldUseNativeValidation,
    delayError,
    ...restOptions
  });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    setValue,
    getValue,
    getValues,
    watch,
    trigger,
    formState: {
      errors,
      isDirty,
      isValid,
      isSubmitted,
      isSubmitting,
      isLoading,
      isSubmitSuccessful,
      submitCount,
      touchedFields,
      dirtyFields
    }
  } = hookFormMethods;

  // Enhanced reset function that preserves original API
  const enhancedReset = useCallback((values = defaultValues) => {
    reset(values);
  }, [reset, defaultValues]);

  // Enhanced set field value with better defaults
  const setFieldValue = useCallback((name, value, options = {}) => {
    setValue(name, value, {
      shouldValidate: true,
      shouldDirty: true,
      ...options
    });
  }, [setValue]);

  // Enhanced set field error
  const setFieldError = useCallback((name, error) => {
    setError(name, {
      type: 'manual',
      message: error
    });
  }, [setError]);

  // Enhanced clear field errors
  const clearFieldErrors = useCallback((names) => {
    if (Array.isArray(names)) {
      names.forEach(name => clearErrors(name));
    } else if (names) {
      clearErrors(names);
    } else {
      clearErrors();
    }
  }, [clearErrors]);

  // Validation function
  const validateForm = useCallback(async (data = getValues()) => {
    return await trigger();
  }, [trigger, getValues]);

  // Return simplified form interface
  return {
    // React-Hook-Form core methods
    control,
    handleSubmit,
    reset: enhancedReset,
    setValue: setFieldValue,
    getValue,
    getValues,
    watch,
    trigger: validateForm,
    clearErrors: clearFieldErrors,
    setError: setFieldError,

    // Form state
    formData: getValues(),
    errors,
    isDirty,
    isValid,
    isSubmitted,
    isSubmitting,
    isLoading,
    isSubmitSuccessful,
    submitCount,
    touchedFields,
    dirtyFields,

    // Validation
    validateForm,

    // Utility functions
    utils: {
      hasErrors: Object.keys(errors).length > 0,
      getFieldError: (name) => errors[name]?.message || errors[name],
      isFieldTouched: (name) => !!touchedFields[name],
      isFieldDirty: (name) => !!dirtyFields[name],
      resetField: (name) => {
        setValue(name, defaultValues[name] || '');
        clearErrors(name);
      }
    }
  };
};

export default useBaseForm; 