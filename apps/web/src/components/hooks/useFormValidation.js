import { useState, useCallback } from 'react';

export const useFormValidation = (validationRules) => {
  const [errors, setErrors] = useState({});

  const validateForm = useCallback((formData) => {
    const newErrors = {};
    Object.keys(validationRules).forEach(field => {
      const value = formData[field];
      const fieldRules = validationRules[field];
      
      if (fieldRules.required && (!value || value.trim() === '')) {
        newErrors[field] = fieldRules.message || `${field} ist erforderlich`;
      } else if (fieldRules.min && Number(value) < fieldRules.min) {
        newErrors[field] = fieldRules.message || `${field} muss mindestens ${fieldRules.min} sein`;
      } else if (fieldRules.max && Number(value) > fieldRules.max) {
        newErrors[field] = fieldRules.message || `${field} darf maximal ${fieldRules.max} sein`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [validationRules]);

  return { errors, validateForm };
};