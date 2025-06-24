import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import { FormProvider } from 'react-hook-form';
import SubmitButton from '../../SubmitButton';
import PlatformSelector from '../../../common/PlatformSelector';
import { useBaseForm } from '../hooks';

// Inline utility functions (moved from classNameUtils and errorUtils)
const hasFormErrors = (formErrors = {}) => Object.keys(formErrors).length > 0;
const getFormContentClasses = (hasFormErrors) => `form-content ${hasFormErrors ? 'has-errors' : ''}`;
const getButtonContainerClasses = (showBackButton) => `button-container ${showBackButton ? 'form-buttons' : ''}`;

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
 * @param {boolean} props.enablePlatformSelector - Soll der Platform Selector aktiviert werden
 * @param {Array} props.platformOptions - Optionen für Platform Selector
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
  onFormChange = null,
  showSubmitButton = false,
  onSubmit,
  loading = false,
  success = false,
  nextButtonText = null,
  submitButtonProps = {},
  enablePlatformSelector = false,
  platformOptions = [],
  platformSelectorTabIndex = 12,
  formControl = null
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
    <div className="form-section__inputs" ref={ref}>
      <div className="form-inputs__content">
        <div className={`form-inputs__fields ${formContentClasses}`}>
          {/* Platform Selector - First Item */}
          {enablePlatformSelector && useModernForm && platformOptions.length > 0 && (
            <div className="form-inputs__platform-selector">
              <PlatformSelector
                name="platforms"
                control={formControl || modernForm.control}
                platformOptions={platformOptions}
                label="Plattformen & Formate"
                placeholder="Plattformen auswählen..."
                required={true}
                helpText="Wähle eine oder mehrere Plattformen für die dein Content optimiert werden soll"
                tabIndex={platformSelectorTabIndex}
              />
            </div>
          )}
          
          {renderChildren()}
        </div>
        
        {(isMultiStep && showBackButton) || showSubmitButton ? (
          <div className={`form-inputs__buttons ${buttonContainerClasses}`}>
            {isMultiStep && showBackButton && (
              <button 
                type="button" 
                onClick={onBack} 
                className="form-inputs__back-button"
              >
                Zurück
              </button>
            )}
            {showSubmitButton && (
              <SubmitButton
                onClick={onSubmit}
                loading={loading}
                success={success}
                text={isMultiStep ? (nextButtonText || 'Weiter') : (submitButtonProps.defaultText || "Grünerieren")}
                className="form-inputs__submit-button button-primary"
                ariaLabel={isMultiStep ? (nextButtonText || 'Weiter') : "Generieren"}
                type="submit"
                {...submitButtonProps}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
});

FormInputSection.propTypes = {
  onSubmit: PropTypes.func,
  loading: PropTypes.bool,
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
  onFormChange: PropTypes.func,
  enablePlatformSelector: PropTypes.bool,
  platformOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired
    })
  ),
  platformSelectorTabIndex: PropTypes.number,
  formControl: PropTypes.object
};

FormInputSection.defaultProps = {
  isMultiStep: false,
  showBackButton: false,
  showSubmitButton: false,
  defaultValues: {},
  validationRules: {},
  useModernForm: true,
  onFormChange: null,
  loading: false,
  success: false,
  nextButtonText: null,
  submitButtonProps: {},
  enablePlatformSelector: false,
  platformOptions: [],
  platformSelectorTabIndex: 12,
  formControl: null
};

FormInputSection.displayName = 'FormInputSection';

export default React.memo(FormInputSection); 