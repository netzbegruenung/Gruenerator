import React from 'react';
import PropTypes from 'prop-types';
import { HiCog } from "react-icons/hi";
import SubmitButton from '../../SubmitButton';
import FeatureToggle from '../../FeatureToggle';
import { getFormContainerClasses, getFormContentClasses, getButtonContainerClasses, getSubmitButtonClasses } from '../utils/classNameUtils';
import { hasFormErrors } from '../utils/errorUtils';

/**
 * Komponente für den Eingabebereich des Formulars
 * @param {Object} props - Komponenten-Props
 * @param {Function} props.onSubmit - Funktion für die Formularübermittlung
 * @param {boolean} props.loading - Ladeindikator
 * @param {boolean} props.success - Erfolgsindikator
 * @param {Object} props.formErrors - Formularfehler
 * @param {boolean} props.isFormVisible - Ist das Formular sichtbar
 * @param {boolean} props.isMultiStep - Ist es ein mehrstufiges Formular
 * @param {Function} props.onBack - Funktion für den Zurück-Button
 * @param {boolean} props.showBackButton - Soll der Zurück-Button angezeigt werden
 * @param {string} props.nextButtonText - Text für den Weiter-Button
 * @param {Object} props.submitButtonProps - Props für den Submit-Button
 * @param {Object} props.featureToggle - Props für den Feature-Toggle
 * @param {boolean} props.useFeatureToggle - Soll der Feature-Toggle verwendet werden
 * @param {node} props.children - Kindelemente
 * @param {boolean} props.showSubmitButton - Soll der Submit-Button angezeigt werden
 * @returns {JSX.Element} Formular-Sektion
 */
const FormSection = ({
  onSubmit,
  loading,
  success,
  formErrors = {},
  isFormVisible,
  isMultiStep,
  onBack,
  showBackButton,
  nextButtonText,
  submitButtonProps = {},
  featureToggle,
  useFeatureToggle,
  children,
  showSubmitButton = true
}) => {
  const formContainerClasses = getFormContainerClasses(isFormVisible);
  const formContentClasses = getFormContentClasses(hasFormErrors(formErrors));
  const buttonContainerClasses = getButtonContainerClasses(showBackButton);
  const submitButtonClasses = getSubmitButtonClasses(showBackButton);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onSubmit();
    } catch (error) {
      console.error('[FormSection] Submit error:', error);
    }
  };

  return (
    <div className={formContainerClasses}>
      <form onSubmit={handleSubmit}>
        <div className={formContentClasses}>
          <div className="form-inner">
            {children}
            {featureToggle && useFeatureToggle && (
              <div className="feature-section">
                <FeatureToggle {...featureToggle} className="form-feature-toggle" />
              </div>
            )}
          </div>
          {isMultiStep ? (
            <div className={buttonContainerClasses}>
              {showBackButton && (
                <button 
                  type="button" 
                  onClick={onBack} 
                  className="back-button form-button"
                >
                  Zurück
                </button>
              )}
              {showSubmitButton && (
                <SubmitButton
                  onClick={onSubmit}
                  loading={loading}
                  success={success}
                  text={nextButtonText || 'Weiter'}
                  icon={<HiCog />}
                  className={submitButtonClasses}
                  ariaLabel={nextButtonText || 'Weiter'}
                  {...submitButtonProps}
                />
              )}
            </div>
          ) : (
            <div className="button-container">
              {showSubmitButton && (
                <SubmitButton
                  onClick={onSubmit}
                  loading={loading}
                  success={success}
                  text={submitButtonProps.defaultText || "Grünerieren"}
                  icon={<HiCog />}
                  className="submit-button form-button"
                  ariaLabel="Generieren"
                  {...submitButtonProps}
                />
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

FormSection.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  formErrors: PropTypes.object,
  isFormVisible: PropTypes.bool.isRequired,
  isMultiStep: PropTypes.bool,
  onBack: PropTypes.func,
  showBackButton: PropTypes.bool,
  nextButtonText: PropTypes.string,
  submitButtonProps: PropTypes.shape({
    statusMessage: PropTypes.string,
    showStatus: PropTypes.bool,
    defaultText: PropTypes.string
  }),
  featureToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string,
    isSearching: PropTypes.bool,
    statusMessage: PropTypes.string
  }),
  useFeatureToggle: PropTypes.bool,
  children: PropTypes.node.isRequired,
  showSubmitButton: PropTypes.bool
};

FormSection.defaultProps = {
  isMultiStep: false,
  showBackButton: false,
  useFeatureToggle: false,
  showSubmitButton: true
};

export default FormSection; 