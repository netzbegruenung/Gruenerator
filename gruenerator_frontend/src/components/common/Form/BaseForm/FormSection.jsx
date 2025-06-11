import React, { forwardRef } from 'react';
import PropTypes from 'prop-types';
import FormCard from './FormCard';
import FormInputSection from './FormInputSection';
import FormExtrasSection from './FormExtrasSection';
import { getFormContainerClasses } from '../utils/classNameUtils';

/**
 * Hauptkomponente für den Formular-Container (Inputs + Extras)
 * @param {Object} props - Komponenten-Props
 * @param {string} props.title - Titel des Formulars
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
 * @param {Object} props.webSearchFeatureToggle - Props für den Web Search Feature-Toggle
 * @param {boolean} props.useWebSearchFeatureToggle - Soll der Web Search Feature-Toggle verwendet werden
 * @param {boolean} props.enableKnowledgeSelector - Soll der Knowledge Selector aktiviert werden
 * @param {node} props.children - Input-Elemente für das Formular
 * @param {boolean} props.showSubmitButton - Soll der Submit-Button angezeigt werden
 * @param {node} props.formNotice - Hinweis oder Information im Formular
 * @param {node} props.extrasChildren - Zusätzliche Extras-Komponenten
 * @param {Object} props.defaultValues - Default-Werte für react-hook-form
 * @param {Object} props.validationRules - Validierungsregeln für Legacy-Support
 * @param {boolean} props.useModernForm - Aktiviert react-hook-form (opt-in)
 * @param {Function} props.onFormChange - Callback für Formular-Änderungen
 * @param {node} props.bottomSectionChildren - Zusätzliche Unterelemente am Ende des Formulars
 * @param {boolean} props.showHideButton - Zeige Verstecken-Button
 * @param {Function} props.onHide - Callback für Verstecken-Button
 * @returns {JSX.Element} Formular-Sektion
 */
const FormSection = forwardRef(({
  title,
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
  webSearchFeatureToggle,
  useWebSearchFeatureToggle,
  enableKnowledgeSelector = false,
  children,
  showSubmitButton = true,
  formNotice = null,
  extrasChildren = null,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null,
  bottomSectionChildren = null,
  showHideButton = false,
  onHide = null
}, ref) => {
  const formContainerClasses = getFormContainerClasses(isFormVisible);

  return (
    <div className={`form-section ${formContainerClasses} ${isFormVisible ? 'visible' : ''}`} ref={ref}>
      <FormCard 
        variant="elevated"
        size="large"
        hover={false}
        title={title}
        showHideButton={showHideButton}
        onHide={onHide}
      >
        <form onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }} className="form-section__form">
          <div className="form-section__container">
            
            {/* Input Section */}
            <FormInputSection
              formErrors={formErrors}
              isMultiStep={isMultiStep}
              onBack={onBack}
              showBackButton={showBackButton}
              defaultValues={defaultValues}
              validationRules={validationRules}
              useModernForm={useModernForm}
              onFormChange={onFormChange}
            >
              {children}
            </FormInputSection>

            {/* Extras Section */}
            <FormExtrasSection
              webSearchFeatureToggle={webSearchFeatureToggle}
              useWebSearchFeatureToggle={useWebSearchFeatureToggle}
              enableKnowledgeSelector={enableKnowledgeSelector}
              formNotice={formNotice}
              onSubmit={onSubmit}
              loading={loading}
              success={success}
              isMultiStep={isMultiStep}
              nextButtonText={nextButtonText}
              submitButtonProps={submitButtonProps}
              showSubmitButton={showSubmitButton}
            >
              {extrasChildren}
            </FormExtrasSection>

          </div>
          {bottomSectionChildren && (
            <div className="form-section__bottom">
              {bottomSectionChildren}
            </div>
          )}
        </form>
      </FormCard>
    </div>
  );
});

FormSection.propTypes = {
  title: PropTypes.string,
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
  webSearchFeatureToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string,
    isSearching: PropTypes.bool,
    statusMessage: PropTypes.string
  }),
  useWebSearchFeatureToggle: PropTypes.bool,
  enableKnowledgeSelector: PropTypes.bool,
  children: PropTypes.oneOfType([PropTypes.node, PropTypes.func]).isRequired,
  showSubmitButton: PropTypes.bool,
  formNotice: PropTypes.node,
  extrasChildren: PropTypes.node,
  defaultValues: PropTypes.object,
  validationRules: PropTypes.object,
  useModernForm: PropTypes.bool,
  onFormChange: PropTypes.func,
  bottomSectionChildren: PropTypes.node,
  showHideButton: PropTypes.bool,
  onHide: PropTypes.func
};

FormSection.defaultProps = {
  isMultiStep: false,
  showBackButton: false,
  useWebSearchFeatureToggle: false,
  enableKnowledgeSelector: false,
  showSubmitButton: true,
  formNotice: null,
  extrasChildren: null,
  defaultValues: {},
  validationRules: {},
  useModernForm: true,
  onFormChange: null,
  bottomSectionChildren: null,
  showHideButton: false,
  onHide: null
};

FormSection.displayName = 'FormSection';

export default FormSection; 