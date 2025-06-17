import React, { useEffect, useContext, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
import useAccessibility from '../../../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../../../utils/accessibilityHelpers';
import { BUTTON_LABELS } from '../../../utils/constants';
import FocusTrap from 'focus-trap-react';
import { motion, AnimatePresence } from 'motion/react';
import { HiPencil } from 'react-icons/hi';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';

// Importiere die Komponenten
import FormSection from './FormSection';
import DisplaySection from './DisplaySection';
import EditorChat from '../../editor/EditorChatnew';
import FormToggleButtonFAB from './FormToggleButtonFAB';

// Importiere die neuen Hooks
import { useContentManagement, useErrorHandling, useResponsive, useBaseForm } from '../hooks';
import { useFormVisibility } from '../hooks/useFormVisibility';

// Importiere die Utility-Funktionen
import { getBaseContainerClasses } from '../utils/classNameUtils';

// Import FormContext
import { FormContext } from '../../../utils/FormContext';

/**
 * Basis-Formular-Komponente
 * @param {Object} props - Komponenten-Props
 */
const BaseForm = ({
  title,
  children,
  onSubmit,
  loading,
  success,
  error: propError,
  formErrors = {},
  onGeneratePost,
  generatedPost,
  allowEditing = true,
  initialContent = '',
  alwaysEditing = false,
  hideEditButton = false,
  isMultiStep = false,
  onBack,
  showBackButton = false,
  nextButtonText,
  generatedContent,
  hideDisplayContainer = false,

  helpContent,
  submitButtonProps = {},
  disableAutoCollapse = false,
  showNextButton = true,
  headerContent,
  webSearchFeatureToggle = null,
  useWebSearchFeatureToggle = false,
  displayActions = null,
  formNotice = null,
  enableKnowledgeSelector = false,
  onSave,
  saveLoading = false,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null,
  accessibilityOptions = {},
  bottomSectionChildren = null,
  componentName = 'default',
  firstExtrasChildren = null
}) => {

  const baseFormRef = useRef(null);
  const formSectionRef = useRef(null);
  const displaySectionRef = useRef(null);

  const {
    error,
    setError
  } = useErrorHandling();
  
  const isStreaming = useGeneratedTextStore(state => state.isStreaming);
  const hasContent = !!generatedContent || isStreaming;
  
  const { isFormVisible, toggleFormVisibility } = useFormVisibility(hasContent, disableAutoCollapse);

  const {
    value,
    isEditing,
    updateWithGeneratedContent,
    handleToggleEditMode,
    getExportableContent
  } = useContentManagement(initialContent);
  
  const {
    isMobileView,
    getDisplayTitle
  } = useResponsive();

  // Enhanced accessibility hook with Phase 5 features
  const { 
    setupKeyboardNav, 
    handleFormError, 
    handleFormSuccess,
    registerFormElement,
    getAccessibilityPreferences,
    testAccessibility
  } = useAccessibility({
    enableEnhancedNavigation: true,
    enableAriaSupport: true,
    enableErrorAnnouncements: true,
    enableSuccessAnnouncements: true,
    keyboardNavigationOptions: {
      onEnterSubmit: true,
      onEscapeCancel: true,
      skipLinkText: 'Zum Hauptinhalt springen',
      enableTabManagement: true,
      ...accessibilityOptions
    }
  });

  // Register form element for accessibility
  useEffect(() => {
    if (baseFormRef.current) {
      registerFormElement(baseFormRef.current);
    }
  }, [registerFormElement]);

  // Setze Fehler aus Props
  useEffect(() => {
    if (propError) {
      setError(propError);
      handleFormError(propError);
    }
  }, [propError, setError, handleFormError]);

  // Handle success states
  useEffect(() => {
    if (success) {
      handleFormSuccess('Formular erfolgreich übermittelt');
    }
  }, [success, handleFormSuccess]);

  // Announce form errors when they change
  useEffect(() => {
    if (formErrors && Object.keys(formErrors).length > 0) {
      const firstErrorKey = Object.keys(formErrors)[0];
      const firstErrorMessage = formErrors[firstErrorKey];
      handleFormError(firstErrorMessage, firstErrorKey);
    }
  }, [formErrors, handleFormError]);

  // Aktualisiere generatedContent in value
  useEffect(() => {
    updateWithGeneratedContent(generatedContent);
  }, [generatedContent, updateWithGeneratedContent]);



  // Setze alwaysEditing
  useEffect(() => {
    if (alwaysEditing && !isEditing) {
      handleToggleEditMode();
    }
  }, [alwaysEditing, isEditing, handleToggleEditMode]);

  // Verbessere Barrierefreiheit
  useEffect(() => {
    enhanceFocusVisibility();

    const labelledElements = [
      { element: document.querySelector('.submit-button'), label: BUTTON_LABELS.SUBMIT },
      { element: document.querySelector('.generate-post-button'), label: BUTTON_LABELS.GENERATE_TEXT },
      { element: document.querySelector('.copy-button'), label: BUTTON_LABELS.COPY },
      { element: document.querySelector('.edit-button'), label: BUTTON_LABELS.EDIT },
    ].filter(item => item.element !== null);

    if (labelledElements.length > 0) {
      addAriaLabelsToElements(labelledElements);
      const interactiveElements = labelledElements.map(item => item.element);
      setupKeyboardNav(interactiveElements);
    }
  }, [setupKeyboardNav, generatedContent]);

  // Development accessibility testing
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && baseFormRef.current) {
      // Add a delay to allow form to fully render
      const timer = setTimeout(() => {
        testAccessibility();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [testAccessibility, children]);

  // Berechne den Anzeigetitel
  const displayTitle = getDisplayTitle('', isEditing, generatedContent);

  // Berechne die Klassennamen für den Container
  const baseContainerClasses = getBaseContainerClasses({
    title,
    generatedContent,
    isFormVisible
  });

  // Enhanced form submission with accessibility announcements
  const handleEnhancedSubmit = async (formData) => {
    try {
      await onSubmit(formData);
      // Success is handled in the success useEffect above
    } catch (error) {
      handleFormError(error.message || 'Ein Fehler ist aufgetreten');
    }
  };

  return (
    <>
      { !isEditing && headerContent }
      <motion.div 
        layout
        transition={{ duration: 0.25, ease: "easeOut" }}
        ref={baseFormRef}
        className={baseContainerClasses}
        role="main"
        aria-label={title || 'Formular'}
        id="main-content"
      >
        <AnimatePresence initial={false}>
          {!isFormVisible && hasContent && !isEditing && (
            <FormToggleButtonFAB onClick={toggleFormVisibility} />
          )}
        </AnimatePresence>
        
        {isEditing ? (
          <FocusTrap active={isEditing}>
            <div ref={displaySectionRef}>
              <EditorChat isEditing={isEditing} />
            </div>
          </FocusTrap>
        ) : (
          <AnimatePresence initial={false}>
            {isFormVisible && (
              <motion.div
                key="form-section"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ 
                  duration: 0.25, 
                  ease: "easeOut"
                }}
                className="form-section-motion-wrapper"
              >
                <FormSection
                  ref={formSectionRef}
                  title={title}
                  onSubmit={useModernForm ? handleEnhancedSubmit : onSubmit}
                  loading={loading}
                  success={success}
                  formErrors={formErrors}
                  isFormVisible={isFormVisible}
                  isMultiStep={isMultiStep}
                  onBack={onBack}
                  showBackButton={showBackButton}
                  nextButtonText={nextButtonText}
                  submitButtonProps={submitButtonProps}
                  webSearchFeatureToggle={webSearchFeatureToggle}
                  useWebSearchFeatureToggle={useWebSearchFeatureToggle}
                  enableKnowledgeSelector={enableKnowledgeSelector}
                  showSubmitButton={showNextButton}
                  formNotice={formNotice}
                  defaultValues={defaultValues}
                  validationRules={validationRules}
                  useModernForm={useModernForm}
                  onFormChange={onFormChange}
                  bottomSectionChildren={bottomSectionChildren}
                  showHideButton={hasContent && !disableAutoCollapse}
                  onHide={toggleFormVisibility}
                  firstExtrasChildren={firstExtrasChildren}
                >
                  {children}
                </FormSection>
              </motion.div>
            )}
          </AnimatePresence>
        )}
        <motion.div
          layout
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={`display-section-motion-wrapper ${isFormVisible ? 'form-visible' : 'form-hidden'}`}
        >
          <DisplaySection
            ref={displaySectionRef}
            title={displayTitle}
            error={error || propError}
            value={value}
            generatedContent={generatedContent}
            isEditing={isEditing}
            allowEditing={allowEditing}
            hideEditButton={hideEditButton}

            helpContent={helpContent}
            generatedPost={generatedPost}
            onGeneratePost={onGeneratePost}
            handleToggleEditMode={handleToggleEditMode}
            getExportableContent={getExportableContent}
            displayActions={displayActions}
            onSave={onSave}
            saveLoading={saveLoading}
            componentName={componentName}
          />
        </motion.div>

        {!isMobileView && (
          <Tooltip id="action-tooltip" place="bottom" />
        )}
      </motion.div>
    </>
  );
};

BaseForm.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  error: PropTypes.string,
  formErrors: PropTypes.object,
  onGeneratePost: PropTypes.func,
  generatedPost: PropTypes.string,
  allowEditing: PropTypes.bool,
  initialContent: PropTypes.string,
  alwaysEditing: PropTypes.bool,
  hideEditButton: PropTypes.bool,

  isMultiStep: PropTypes.bool,
  onBack: PropTypes.func,
  showBackButton: PropTypes.bool,
  nextButtonText: PropTypes.string,
  generatedContent: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      content: PropTypes.string
    })
  ]),
  hideDisplayContainer: PropTypes.bool,

  helpContent: PropTypes.shape({
    content: PropTypes.string,
    tips: PropTypes.arrayOf(PropTypes.string)
  }),
  submitButtonProps: PropTypes.shape({
    statusMessage: PropTypes.string,
    showStatus: PropTypes.bool,
    defaultText: PropTypes.string
  }),
  disableAutoCollapse: PropTypes.bool,
  showNextButton: PropTypes.bool,
  headerContent: PropTypes.node,
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
  displayActions: PropTypes.node,
  formNotice: PropTypes.node,
  enableKnowledgeSelector: PropTypes.bool,
  onSave: PropTypes.func,
  saveLoading: PropTypes.bool,
  defaultValues: PropTypes.object,
  validationRules: PropTypes.object,
  useModernForm: PropTypes.bool,
  onFormChange: PropTypes.func,
  accessibilityOptions: PropTypes.object,
  bottomSectionChildren: PropTypes.node,
  componentName: PropTypes.string,
  firstExtrasChildren: PropTypes.node
};

BaseForm.defaultProps = {
  showNextButton: true,
  webSearchFeatureToggle: null,
  useWebSearchFeatureToggle: false,
  displayActions: null,
  formNotice: null,
  enableKnowledgeSelector: false,
  defaultValues: {},
  validationRules: {},
  useModernForm: true,
  onFormChange: null,
  accessibilityOptions: {},
  bottomSectionChildren: null,
  firstExtrasChildren: null
};

export default BaseForm; 