import { useForm } from 'react-hook-form';
import { useCallback, useState } from 'react';

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

  // Error handling state and functions
  const [globalError, setGlobalError] = useState('');

  /**
   * Generates user-friendly error message based on error code
   * @param {string} error - Error text or code
   * @returns {string} User-friendly error message
   */
  const getErrorMessage = useCallback((error) => {
    if (!error) return '';
    
    const errorMessages = {
      '400': 'Deine Eingabe konnte nicht verarbeitet werden. Bitte überprüfe deine Eingaben und versuche es erneut.',
      '401': 'Es gibt ein Problem mit der Verbindung zum Server. Bitte lade die Seite neu.',
      '403': 'Du hast leider keine Berechtigung für diese Aktion. Bitte kontaktiere uns, wenn du denkst, dass dies ein Fehler ist.',
      '404': 'Die angeforderte Ressource wurde nicht gefunden. Möglicherweise wurde sie gelöscht oder verschoben.',
      '413': 'Deine Eingabe ist zu lang. Bitte kürze deinen Text etwas.',
      '429': 'Unser System wird gerade von zu vielen Nutzer*innen verwendet. Bitte warte einen Moment und versuche es dann erneut. Du kannst alternativ den Grünerator Backup verwenden.',
      '500': 'Ein unerwarteter Fehler ist aufgetreten. Du kannst alternativ Grünerator Backup verwenden.',
      '529': 'Die Server unseres KI-Anbieters Anthropic sind momentan überlastet. Bitte versuche es in einigen Minuten erneut. Du kannst alternativ den Grünerator Backup verwenden.'
    };

    for (const [code, message] of Object.entries(errorMessages)) {
      if (error.includes(code)) {
        return `[Fehler ${code}] ${message} Es tut mir sehr leid. Bitte versuche es später erneut.`;
      }
    }

    return `Ein Fehler ist aufgetreten. Es tut mir sehr leid. Bitte versuche es später erneut.`;
  }, []);

  /**
   * Handles errors during form submission
   * @param {Error} error - Error object
   */
  const handleSubmitError = useCallback((error) => {
    console.error('[useBaseForm] Submit error:', error);
    if (error?.response?.status) {
      setGlobalError(`${error.response.status}`);
    } else if (error?.message) {
      setGlobalError(error.message);
    } else {
      setGlobalError('Ein unbekannter Fehler ist aufgetreten.');
    }
  }, []);

  /**
   * Clears the global error state
   */
  const clearGlobalError = useCallback(() => {
    setGlobalError('');
  }, []);

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

    // Error handling
    globalError,
    setGlobalError,
    getErrorMessage,
    handleSubmitError,
    clearGlobalError,

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