import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { FormProvider } from 'react-hook-form';
import { motion } from 'motion/react';
import { HiCog } from "react-icons/hi";
import SubmitButton from '../../SubmitButton';
import { getFormContentClasses, getButtonContainerClasses, getSubmitButtonClasses } from '../utils/classNameUtils';
import { hasFormErrors } from '../utils/errorUtils';
import { useBaseForm } from '../hooks';

/**
 * Komponente für den reinen Input-Bereich des Formulars
 * @param {Object} props - Komponenten-Props
 * @param {Function} props.onSubmit - Funktion für die Formularübermittlung
 * @param {boolean} props.loading - Ladeindikator
 * @param {boolean} props.success - Erfolgsindikator
 * @param {Object} props.formErrors - Formularfehler
 * @param {boolean} props.isMultiStep - Ist es ein mehrstufiges Formular
 * @param {Function} props.onBack - Funktion für den Zurück-Button
 * @param {boolean} props.showBackButton - Soll der Zurück-Button angezeigt werden
 * @param {string} props.nextButtonText - Text für den Weiter-Button
 * @param {Object} props.submitButtonProps - Props für den Submit-Button
 * @param {node} props.children - Input-Elemente
 * @param {boolean} props.showSubmitButton - Soll der Submit-Button angezeigt werden
 * @param {Object} props.defaultValues - Default-Werte für react-hook-form
 * @param {Object} props.validationRules - Validierungsregeln für Legacy-Support
 * @param {boolean} props.useModernForm - Aktiviert react-hook-form (opt-in)
 * @param {Function} props.onFormChange - Callback für Formular-Änderungen
 * @returns {JSX.Element} Formular-Input Sektion
 */
const FormInputSection = forwardRef(({
  formErrors = {},
  isMultiStep,
  onBack,
  showBackButton,
  children,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null
}, ref) => {
  const formContentClasses = getFormContentClasses(hasFormErrors(formErrors));
  const buttonContainerClasses = getButtonContainerClasses(showBackButton);

  // Initialize react-hook-form only if useModernForm is enabled
  const modernForm = useBaseForm({
    defaultValues,
    validationRules,
    enableLegacyMode: true // Always enable legacy mode for backward compatibility
  });

  // Enhanced form change handler
  const handleFormChange = (name, value) => {
    if (useModernForm) {
      modernForm.setValue(name, value);
    }
    if (onFormChange) {
      onFormChange(name, value, useModernForm ? modernForm.getValues() : {});
    }
  };

  // Enhanced children rendering with FormProvider context
  const renderChildren = () => {
    if (useModernForm) {
      return (
        <FormProvider {...modernForm}>
          {typeof children === 'function' 
            ? children({ 
                control: modernForm.control,
                errors: modernForm.errors,
                formData: modernForm.formData,
                handleChange: handleFormChange,
                ...modernForm 
              })
            : children
          }
        </FormProvider>
      );
    }
    return children;
  };

  return (
    <motion.div 
      className="form-section__inputs" 
      ref={ref}
      layout
      transition={{ 
        type: "spring", 
        stiffness: 400, 
        damping: 25,
        duration: 0.25 
      }}
    >
      <motion.div 
        className="form-inputs__content"
        layout
      >
        <motion.div 
          className={`form-inputs__fields ${formContentClasses}`}
          layout
        >
          {renderChildren()}
        </motion.div>
        
        {isMultiStep && showBackButton && (
          <div className={`form-inputs__buttons ${buttonContainerClasses}`}>
            <button 
              type="button" 
              onClick={onBack} 
              className="form-inputs__back-button"
            >
              Zurück
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
});

FormInputSection.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  formErrors: PropTypes.object,
  isMultiStep: PropTypes.bool,
  onBack: PropTypes.func,
  showBackButton: PropTypes.bool,
  nextButtonText: PropTypes.string,
  submitButtonProps: PropTypes.shape({
    statusMessage: PropTypes.string,
    showStatus: PropTypes.bool,
    defaultText: PropTypes.string
  }),
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
  showSubmitButton: PropTypes.bool,
  defaultValues: PropTypes.object,
  validationRules: PropTypes.object,
  useModernForm: PropTypes.bool,
  onFormChange: PropTypes.func
};

FormInputSection.defaultProps = {
  isMultiStep: false,
  showBackButton: false,
  showSubmitButton: true,
  defaultValues: {},
  validationRules: {},
  useModernForm: true,
  onFormChange: null
};

FormInputSection.displayName = 'FormInputSection';

export default FormInputSection; 