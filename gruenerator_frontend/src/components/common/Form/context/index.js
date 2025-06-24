// FormContext deprecated - components should use generatedTextStore directly
// This file is kept for backward compatibility but exports nothing
console.warn('FormContext is deprecated. Use useGeneratedTextStore instead.');

export const FormContext = null;
export const FormProvider = ({ children }) => children; 