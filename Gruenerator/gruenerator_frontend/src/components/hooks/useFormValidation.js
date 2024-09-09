import { useState, useCallback } from 'react';

export const useFormValidation = (validationRules) => {
  const [errors, setErrors] = useState({});

  const validateForm = useCallback((formData) => {
    const newErrors = {};
    Object.keys(validationRules).forEach(field => {
      const value = formData[field];
      const fieldRules = validationRules[field];
      
      if (fieldRules.required && (!value || value.trim() === '')) {
        newErrors[field] = `${field} ist erforderlich`;
      } else if (fieldRules.pattern && !fieldRules.pattern.test(value)) {
        newErrors[field] = fieldRules.message || `${field} ist ungültig`;
      }
      // Hier können weitere Validierungsregeln hinzugefügt werden
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [validationRules]);

  return { errors, validateForm };
};