import { useController } from 'react-hook-form';

/**
 * Hook für react-hook-form Controller Integration
 * Wrapper um useController mit zusätzlichen Validation-Features
 * @param {Object} config - Controller-Konfiguration
 * @returns {Object} Field-Props und Zustand
 */
const useFormController = ({
  name,
  control,
  rules = {},
  defaultValue = '',
  shouldUnregister = false,
  ...rest
}) => {
  const {
    field,
    fieldState: { invalid, isTouched, isDirty, error },
    formState: { touchedFields, errors }
  } = useController({
    name,
    control,
    rules,
    defaultValue,
    shouldUnregister,
    ...rest
  });

  // Enhanced validation rules with German messages
  const enhancedRules = {
    ...rules,
    ...(rules.required && typeof rules.required === 'boolean' && {
      required: 'Dieses Feld ist erforderlich'
    })
  };

  // Field props with enhanced error handling
  const fieldProps = {
    ...field,
    'aria-invalid': invalid,
    'aria-describedby': error ? `${name}-error` : undefined
  };

  // Enhanced field state
  const fieldState = {
    invalid,
    isTouched,
    isDirty,
    error,
    hasError: !!error,
    errorMessage: error?.message || '',
    isValid: !invalid && isTouched
  };

  // Helper functions
  const helpers = {
    // Clear field value
    clear: () => field.onChange(''),
    
    // Set field value
    setValue: (value) => field.onChange(value),
    
    // Validate field manually
    validate: () => {
      // Trigger validation for this field
      return !invalid;
    },
    
    // Focus field
    focus: (ref) => {
      if (ref?.current) {
        ref.current.focus();
      }
    }
  };

  return {
    field: fieldProps,
    fieldState,
    helpers,
    rules: enhancedRules
  };
};

export default useFormController; 