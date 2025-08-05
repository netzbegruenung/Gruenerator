import React, { useEffect, useContext, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
import useAccessibility from '../../../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../../../utils/accessibilityHelpers';
import { BUTTON_LABELS } from '../../../utils/constants';
import { motion, AnimatePresence } from 'motion/react';
import { HiPencil } from 'react-icons/hi';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';

// Importiere die Komponenten
import FormSection from './FormSection';
import DisplaySection from './DisplaySection';

// Importiere die neuen Hooks
import { useErrorHandling, useResponsive } from '../hooks';
import { useFormVisibility } from '../hooks/useFormVisibility';

// Importiere die Utility-Funktionen
import { getExportableContent } from '../utils/contentUtils';

// Inline utility function (moved from classNameUtils)
const getBaseContainerClasses = ({ title, generatedContent, isFormVisible }) => {
  const classes = [
    'base-container',
    title === "Grünerator Antragscheck" ? 'antragsversteher-base' : '',
    generatedContent && (
      typeof generatedContent === 'string' ? generatedContent.length > 0 : generatedContent?.content?.length > 0
    ) ? 'has-generated-content' : ''
  ];
  return classes.filter(Boolean).join(' ');
};

// Inline FormToggleButtonFAB component (previously separate file) - memoized for performance
const FormToggleButtonFAB = React.memo(({ onClick }) => (
  <motion.button
    className="form-toggle-fab"
    onClick={onClick}
    initial={{ scale: 0, y: 50, opacity: 0 }}
    animate={{ scale: 1, y: 0, opacity: 1 }}
    exit={{ scale: 0, y: 50, opacity: 0 }}
    whileHover={{ scale: 1.1, backgroundColor: 'var(--klee)' }}
    whileTap={{ scale: 0.95 }}
    transition={{ type: "spring", stiffness: 500, damping: 30 }}
    aria-label="Formular anzeigen"
  >
    <HiPencil size="24" />
  </motion.button>
));


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
  initialContent = '',
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
  // New consolidated prop (optional, backward compatible)
  submitConfig = null,
  headerContent,
  webSearchFeatureToggle = null,
  useWebSearchFeatureToggle = false,
  // New consolidated prop (optional, backward compatible)
  webSearchConfig = null,
  displayActions = null,
  formNotice = null,
  enablePlatformSelector = false,
  platformOptions = [],
  platformSelectorLabel = undefined,
  platformSelectorPlaceholder = undefined,
  platformSelectorHelpText = undefined,
  formControl = null,
  onSave,
  saveLoading = false,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null,
  accessibilityOptions = {},
  bottomSectionChildren = null,
  componentName = 'default',
  firstExtrasChildren = null,
  useMarkdown = null,
  // TabIndex configuration
  platformSelectorTabIndex = 12,
  knowledgeSelectorTabIndex = 14,
  knowledgeSourceSelectorTabIndex = 13,
  showProfileSelector = true,
  documentSelectorTabIndex = 15,
  submitButtonTabIndex = 17,
  showImageUpload = false,
  uploadedImage = null,
  onImageChange = null
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

  // Consolidated config with backward compatibility
  const resolvedSubmitConfig = React.useMemo(() => {
    if (submitConfig) {
      return {
        showButton: submitConfig.showButton ?? showNextButton,
        buttonText: submitConfig.buttonText ?? nextButtonText,
        buttonProps: submitConfig.buttonProps ?? submitButtonProps,
        ...submitConfig
      };
    }
    return {
      showButton: showNextButton,
      buttonText: nextButtonText,
      buttonProps: submitButtonProps
    };
  }, [submitConfig, showNextButton, nextButtonText, submitButtonProps]);

  // Consolidated webSearch config with backward compatibility
  const resolvedWebSearchConfig = React.useMemo(() => {
    if (webSearchConfig) {
      return {
        enabled: webSearchConfig.enabled ?? useWebSearchFeatureToggle,
        toggle: webSearchConfig.toggle ?? webSearchFeatureToggle,
        ...webSearchConfig
      };
    }
    return {
      enabled: useWebSearchFeatureToggle,
      toggle: webSearchFeatureToggle
    };
  }, [webSearchConfig, useWebSearchFeatureToggle, webSearchFeatureToggle]);
  
  const { isFormVisible, toggleFormVisibility } = useFormVisibility(hasContent, disableAutoCollapse);

  // Direct store access instead of useContentManagement
  const value = useGeneratedTextStore(state => state.getGeneratedText(componentName));
  const setGeneratedText = useGeneratedTextStore(state => state.setGeneratedText);
  
  // Initialize with initial content if needed
  useEffect(() => {
    if (initialContent && !value) {
      setGeneratedText(componentName, initialContent);
    }
  }, [initialContent, value, setGeneratedText, componentName]);

  // Update store when generatedContent changes
  useEffect(() => {
    if (generatedContent) {
      // Check if it's mixed content (has both social and sharepic)
      const isMixedContent = typeof generatedContent === 'object' && 
        (generatedContent.sharepic || generatedContent.social);
      
      if (isMixedContent) {
        // Store the full mixed content object
        setGeneratedText(componentName, generatedContent);
      } else if (typeof generatedContent === 'object' && 'content' in generatedContent) {
        // Regular object with content property - extract content
        setGeneratedText(componentName, generatedContent.content);
      } else if (typeof generatedContent === 'string') {
        // Plain string content
        setGeneratedText(componentName, generatedContent);
      } else {
        // Any other object type - store as-is
        setGeneratedText(componentName, generatedContent);
      }
    }
  }, [generatedContent, setGeneratedText, componentName]);

  // Function to get exportable content
  const getExportableContentCallback = useCallback((content) => {
    return getExportableContent(content, value);
  }, [value]);
  
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
      // Only setup custom keyboard navigation for specific interactive elements
      // Skip for forms to allow natural tab navigation
      if (!baseFormRef.current?.querySelector('form')) {
        const interactiveElements = labelledElements.map(item => item.element);
        setupKeyboardNav(interactiveElements);
      }
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

  // Berechne den Anzeigetitel (memoized for performance)
  const displayTitle = React.useMemo(() => 
    getDisplayTitle('', false, generatedContent), 
    [getDisplayTitle, generatedContent]
  );

  // Berechne die Klassennamen für den Container (memoized for performance)
  const baseContainerClasses = React.useMemo(() => getBaseContainerClasses({
    title,
    generatedContent,
    isFormVisible
  }), [title, generatedContent, isFormVisible]);

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
      { headerContent }
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
          {!isFormVisible && hasContent && (
            <FormToggleButtonFAB onClick={toggleFormVisibility} />
          )}
        </AnimatePresence>
        
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
                  nextButtonText={resolvedSubmitConfig.buttonText}
                  submitButtonProps={resolvedSubmitConfig.buttonProps}
                  webSearchFeatureToggle={resolvedWebSearchConfig.toggle}
                  useWebSearchFeatureToggle={resolvedWebSearchConfig.enabled}
                  enablePlatformSelector={enablePlatformSelector}
                  platformOptions={platformOptions}
                  platformSelectorLabel={platformSelectorLabel}
                  platformSelectorPlaceholder={platformSelectorPlaceholder}
                  platformSelectorHelpText={platformSelectorHelpText}
                  formControl={formControl}
                  showSubmitButton={resolvedSubmitConfig.showButton}
                  formNotice={formNotice}
                  defaultValues={defaultValues}
                  validationRules={validationRules}
                  useModernForm={useModernForm}
                  onFormChange={onFormChange}
                  bottomSectionChildren={bottomSectionChildren}
                  showHideButton={hasContent && !disableAutoCollapse}
                  onHide={toggleFormVisibility}
                  firstExtrasChildren={firstExtrasChildren}
                  platformSelectorTabIndex={platformSelectorTabIndex}
                  knowledgeSelectorTabIndex={knowledgeSelectorTabIndex}
                  knowledgeSourceSelectorTabIndex={knowledgeSourceSelectorTabIndex}
                  documentSelectorTabIndex={documentSelectorTabIndex}
                  submitButtonTabIndex={submitButtonTabIndex}
                  showProfileSelector={showProfileSelector}
                  showImageUpload={showImageUpload}
                  uploadedImage={uploadedImage}
                  onImageChange={onImageChange}
                >
                  {children}
                </FormSection>
              </motion.div>
            )}
          </AnimatePresence>
        
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
            useMarkdown={useMarkdown}

            helpContent={helpContent}
            generatedPost={generatedPost}
            onGeneratePost={onGeneratePost}
            getExportableContent={getExportableContentCallback}
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
  initialContent: PropTypes.string,

  isMultiStep: PropTypes.bool,
  onBack: PropTypes.func,
  showBackButton: PropTypes.bool,
  nextButtonText: PropTypes.string,
  generatedContent: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
      content: PropTypes.string
    }),
    PropTypes.shape({
      sharepic: PropTypes.object,
      social: PropTypes.object,
      content: PropTypes.string,
      metadata: PropTypes.object
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
  submitConfig: PropTypes.shape({
    showButton: PropTypes.bool,
    buttonText: PropTypes.string,
    buttonProps: PropTypes.object
  }),
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
  webSearchConfig: PropTypes.shape({
    enabled: PropTypes.bool,
    toggle: PropTypes.object
  }),
  displayActions: PropTypes.node,
  formNotice: PropTypes.node,
  enableKnowledgeSelector: PropTypes.bool,
  enablePlatformSelector: PropTypes.bool,
  platformOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired
    })
  ),
  platformSelectorLabel: PropTypes.string,
  platformSelectorPlaceholder: PropTypes.string,
  platformSelectorHelpText: PropTypes.string,
  formControl: PropTypes.object,
  onSave: PropTypes.func,
  saveLoading: PropTypes.bool,
  defaultValues: PropTypes.object,
  validationRules: PropTypes.object,
  useModernForm: PropTypes.bool,
  onFormChange: PropTypes.func,
  accessibilityOptions: PropTypes.object,
  bottomSectionChildren: PropTypes.node,
  componentName: PropTypes.string,
  firstExtrasChildren: PropTypes.node,
  useMarkdown: PropTypes.bool,
  // TabIndex configuration
  platformSelectorTabIndex: PropTypes.number,
  knowledgeSelectorTabIndex: PropTypes.number,
  knowledgeSourceSelectorTabIndex: PropTypes.number,
  submitButtonTabIndex: PropTypes.number,
  showImageUpload: PropTypes.bool,
  uploadedImage: PropTypes.object,
  onImageChange: PropTypes.func
};

BaseForm.defaultProps = {
  showNextButton: true,
  webSearchFeatureToggle: null,
  useWebSearchFeatureToggle: false,
  displayActions: null,
  formNotice: null,
  enableKnowledgeSelector: false,
  enablePlatformSelector: false,
  platformOptions: [],
  platformSelectorLabel: undefined,
  platformSelectorPlaceholder: undefined,
  platformSelectorHelpText: undefined,
  formControl: null,
  defaultValues: {},
  validationRules: {},
  useModernForm: true,
  onFormChange: null,
  accessibilityOptions: {},
  bottomSectionChildren: null,
  firstExtrasChildren: null,
  // TabIndex configuration defaults
  platformSelectorTabIndex: 12,
  knowledgeSelectorTabIndex: 14,
  knowledgeSourceSelectorTabIndex: 13,
  submitButtonTabIndex: 17,
  showImageUpload: false,
  uploadedImage: null,
  onImageChange: null
};

export default React.memo(BaseForm); 