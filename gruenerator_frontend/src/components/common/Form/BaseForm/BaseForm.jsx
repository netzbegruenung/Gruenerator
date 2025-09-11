import React, { useEffect, useContext, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Tooltip } from 'react-tooltip';
import useAccessibility from '../../../hooks/useAccessibility';
import { addAriaLabelsToElements, enhanceFocusVisibility } from '../../../utils/accessibilityHelpers';
import { BUTTON_LABELS } from '../../../utils/constants';
import { motion, AnimatePresence } from 'motion/react';
import { HiPencil } from 'react-icons/hi';
import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import FormStateProvider, { useFormState, useFormStateSelector } from '../FormStateProvider';

// Import all form-related CSS
import '../../../../assets/styles/components/ui/forms.css';
import '../../../../assets/styles/components/ui/form-select-modern.css';
import '../../../../assets/styles/components/ui/form-toggle-button.css';
import '../../../../assets/styles/components/ui/quote-form.css';
import '../../../../assets/styles/components/ui/FeatureToggle.css';
import '../../../../assets/styles/components/ui/AttachedFilesList.css';
import '../../../../assets/styles/components/ui/button.css';
import '../../../../assets/styles/components/ui/spinner.css';
import '../../../../assets/styles/components/ui/tooltip.css';
import '../../../../assets/styles/components/ui/react-select.css';
import '../../../../assets/styles/components/ui/knowledge-selector.css';
import '../../../../assets/styles/components/ui/enhanced-select.css';
import '../../../../assets/styles/components/ui/animatedcheckbox.css';
import '../../../../assets/styles/components/ui/SegmentedControl.css';
import '../../../../assets/styles/components/form/form-inputs.css';
import '../../../../assets/styles/components/form/file-upload.css';
import '../../../../assets/styles/components/baseform/base.css';
import '../../../../assets/styles/components/baseform/form-layout.css';
import '../../../../assets/styles/components/baseform/form-toggle-fab.css';
import '../../../../assets/styles/components/edit-mode/edit-mode-overlay.css';
import '../../../../assets/styles/components/help-tooltip.css';
import '../../../../assets/styles/pages/baseform.css';

// Importiere die Komponenten
import FormSection from './FormSection';
import DisplaySection from './DisplaySection';

// Importiere die neuen Hooks
import { useErrorHandling, useResponsive } from '../hooks';
import { useFormVisibility } from '../hooks/useFormVisibility';

// Importiere die Utility-Funktionen
import { getExportableContent } from '../utils/contentUtils';

// Inline utility function (moved from classNameUtils)
const getBaseContainerClasses = ({ title, generatedContent, isFormVisible, isEditModeActive }) => {
  const classes = [
    'base-container',
    title === "Grünerator Antragscheck" ? 'antragsversteher-base' : '',
    generatedContent && (
      typeof generatedContent === 'string' ? generatedContent.length > 0 : generatedContent?.content?.length > 0
    ) ? 'has-generated-content' : '',
    isEditModeActive ? 'edit-mode-active' : ''
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
 * Internal BaseForm component that uses the FormStateProvider context
 * @param {Object} props - Komponenten-Props
 */
const BaseFormInternal = ({
  title,
  children,
  onSubmit,
  loading: propLoading,
  success: propSuccess,
  error: propError,
  formErrors: propFormErrors = {},
  onGeneratePost,
  generatedPost,
  initialContent = '',
  isMultiStep = false,
  onBack,
  showBackButton = false,
  onEditSubmit = null,
  nextButtonText,
  generatedContent,
  hideDisplayContainer = false,

  helpContent,
  submitButtonProps = {},
  disableAutoCollapse = false, // Deprecated: form no longer auto-collapses by default
  showNextButton = true,
  // New consolidated prop (optional, backward compatible)
  submitConfig = null,
  headerContent,
  // Feature toggle props - now with defaults that can be overridden
  webSearchFeatureToggle = null,
  useWebSearchFeatureToggle = false,
  webSearchConfig = null,
  privacyModeToggle = null,
  usePrivacyModeToggle = false,
  privacyModeConfig = null,
  useFeatureIcons: propUseFeatureIcons = false,
  onAttachmentClick,
  onRemoveFile,
  attachedFiles: propAttachedFiles = [],
  displayActions = null,
  formNotice = null,
  enablePlatformSelector = false,
  platformOptions = [],
  platformSelectorLabel = undefined,
  platformSelectorPlaceholder = undefined,
  platformSelectorHelpText = undefined,
  formControl = null,
  onSave,
  saveLoading: propSaveLoading = false,
  defaultValues = {},
  validationRules = {},
  useModernForm = true,
  onFormChange = null,
  accessibilityOptions = {},
  bottomSectionChildren = null,
  componentName = 'default',
  firstExtrasChildren = null,
  useMarkdown = null,
  enableEditMode = false,
  // TabIndex configuration
  featureIconsTabIndex = {
    webSearch: 11,
    privacyMode: 12,
    attachment: 13
  },
  platformSelectorTabIndex = 12,
  knowledgeSelectorTabIndex = 14,
  knowledgeSourceSelectorTabIndex = 13,
  showProfileSelector = true,
  documentSelectorTabIndex = 15,
  submitButtonTabIndex = 17,
  showImageUpload = false,
  uploadedImage: propUploadedImage = null,
  onImageChange = null
}) => {

  const baseFormRef = useRef(null);
  const formSectionRef = useRef(null);
  const displaySectionRef = useRef(null);
  const [inlineHelpContentOverride, setInlineHelpContentOverride] = useState(null);
  const editSubmitHandlerRef = useRef(null);

  // Store selectors
  const storeLoading = useFormStateSelector(state => state.loading);
  const storeSuccess = useFormStateSelector(state => state.success);
  const storeError = useFormStateSelector(state => state.error);
  const storeFormErrors = useFormStateSelector(state => state.formErrors);
  const storeSaveLoading = useFormStateSelector(state => state.saveLoading);
  const storeWebSearchConfig = useFormStateSelector(state => state.webSearchConfig);
  const storePrivacyModeConfig = useFormStateSelector(state => state.privacyModeConfig);
  const storeUseFeatureIcons = useFormStateSelector(state => state.useFeatureIcons);
  const storeAttachedFiles = useFormStateSelector(state => state.attachedFiles);
  const storeUploadedImage = useFormStateSelector(state => state.uploadedImage);
  const storeIsFormVisible = useFormStateSelector(state => state.isFormVisible);
  
  // Store actions
  const setStoreLoading = useFormStateSelector(state => state.setLoading);
  const setStoreSuccess = useFormStateSelector(state => state.setSuccess);
  const setStoreError = useFormStateSelector(state => state.setError);
  const setStoreFormErrors = useFormStateSelector(state => state.setFormErrors);
  const setStoreSaveLoading = useFormStateSelector(state => state.setSaveLoading);
  const clearStoreError = useFormStateSelector(state => state.clearError);
  const setStoreWebSearchEnabled = useFormStateSelector(state => state.setWebSearchEnabled);
  const setStorePrivacyModeEnabled = useFormStateSelector(state => state.setPrivacyModeEnabled);
  const setStoreUseFeatureIcons = useFormStateSelector(state => state.setUseFeatureIcons);
  const setStoreAttachedFiles = useFormStateSelector(state => state.setAttachedFiles);
  const setStoreUploadedImage = useFormStateSelector(state => state.setUploadedImage);
  const toggleStoreFormVisibility = useFormStateSelector(state => state.toggleFormVisibility);
  
  const {
    error,
    setError
  } = useErrorHandling();
  
  // Use store state with prop fallbacks
  const loading = storeLoading || propLoading;
  const success = storeSuccess || propSuccess;
  const formErrors = Object.keys(storeFormErrors).length > 0 ? storeFormErrors : propFormErrors;
  const saveLoading = storeSaveLoading || propSaveLoading;
  const useFeatureIcons = storeUseFeatureIcons || propUseFeatureIcons;
  const attachedFiles = storeAttachedFiles.length > 0 ? storeAttachedFiles : propAttachedFiles;
  const uploadedImage = storeUploadedImage || propUploadedImage;
  
  const isStreaming = useGeneratedTextStore(state => state.isStreaming);
  const hasContent = !!generatedContent || isStreaming;
  const [isEditModeToggled, setIsEditModeToggled] = React.useState(false);
  const isEditModeActive = isEditModeToggled && enableEditMode && hasContent;
  
  // Auto-activate edit mode when new text is generated (desktop only)
  const prevHasContentRef = useRef(hasContent);
  useEffect(() => {
    // Only auto-activate if:
    // 1. Edit mode is enabled for this component
    // 2. We just got content (transition from no content to has content)
    // 3. Edit mode isn't already active
    // 4. Not on mobile device
    const isMobileDevice = window.innerWidth <= 768;
    if (enableEditMode && !prevHasContentRef.current && hasContent && !isEditModeToggled && !isMobileDevice) {
      setIsEditModeToggled(true);
    }
    prevHasContentRef.current = hasContent;
  }, [hasContent, enableEditMode, isEditModeToggled]);
  
  // Handler for edit mode toggle
  const handleToggleEditMode = React.useCallback(() => {
    setIsEditModeToggled(prev => !prev);
  }, []);

  // Handler for finetune mode toggle

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
  const showSubmitButtonFinal = resolvedSubmitConfig.showButton;

  // In Edit Mode, reuse the same submit button but adapt default text
  const effectiveSubmitButtonProps = React.useMemo(() => {
    const base = resolvedSubmitConfig.buttonProps || {};
    if (isEditModeActive) {
      return { ...base, defaultText: base.defaultText || 'Verbessern' };
    }
    return base;
  }, [resolvedSubmitConfig.buttonProps, isEditModeActive]);

  // Consolidated webSearch config with store integration
  const resolvedWebSearchConfig = React.useMemo(() => {
    if (webSearchConfig) {
      return {
        enabled: webSearchConfig.enabled ?? storeWebSearchConfig.enabled ?? useWebSearchFeatureToggle,
        toggle: webSearchConfig.toggle ?? webSearchFeatureToggle,
        ...webSearchConfig
      };
    }
    return {
      enabled: storeWebSearchConfig.enabled || useWebSearchFeatureToggle,
      toggle: webSearchFeatureToggle
    };
  }, [webSearchConfig, useWebSearchFeatureToggle, webSearchFeatureToggle, storeWebSearchConfig]);

  // Consolidated privacyMode config with store integration
  const resolvedPrivacyModeConfig = React.useMemo(() => {
    if (privacyModeConfig) {
      return {
        enabled: privacyModeConfig.enabled ?? storePrivacyModeConfig.enabled ?? usePrivacyModeToggle,
        toggle: privacyModeConfig.toggle ?? privacyModeToggle,
        ...privacyModeConfig
      };
    }
    return {
      enabled: storePrivacyModeConfig.enabled || usePrivacyModeToggle,
      toggle: privacyModeToggle
    };
  }, [privacyModeConfig, usePrivacyModeToggle, privacyModeToggle, storePrivacyModeConfig]);
  
  // Use store form visibility with fallback to useFormVisibility
  const fallbackFormVisibility = useFormVisibility(hasContent, disableAutoCollapse);
  const isFormVisible = storeIsFormVisible !== undefined ? storeIsFormVisible : fallbackFormVisibility.isFormVisible;
  const toggleFormVisibility = toggleStoreFormVisibility || fallbackFormVisibility.toggleFormVisibility;

  // Direct store access instead of useContentManagement
  const value = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');
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

  // Synchronize props with store state
  useEffect(() => {
    if (propLoading !== undefined) setStoreLoading(propLoading);
  }, [propLoading, setStoreLoading]);
  
  useEffect(() => {
    if (propSuccess !== undefined) setStoreSuccess(propSuccess);
  }, [propSuccess, setStoreSuccess]);
  
  useEffect(() => {
    if (propFormErrors && Object.keys(propFormErrors).length > 0) {
      setStoreFormErrors(propFormErrors);
    }
  }, [propFormErrors, setStoreFormErrors]);
  
  useEffect(() => {
    if (useWebSearchFeatureToggle !== undefined) {
      setStoreWebSearchEnabled(useWebSearchFeatureToggle);
    }
  }, [useWebSearchFeatureToggle, setStoreWebSearchEnabled]);
  
  useEffect(() => {
    if (usePrivacyModeToggle !== undefined) {
      setStorePrivacyModeEnabled(usePrivacyModeToggle);
    }
  }, [usePrivacyModeToggle, setStorePrivacyModeEnabled]);
  
  useEffect(() => {
    if (propUseFeatureIcons !== undefined) {
      setStoreUseFeatureIcons(propUseFeatureIcons);
    }
  }, [propUseFeatureIcons, setStoreUseFeatureIcons]);
  
  useEffect(() => {
    if (propAttachedFiles?.length > 0) {
      setStoreAttachedFiles(propAttachedFiles);
    }
  }, [propAttachedFiles, setStoreAttachedFiles]);
  
  useEffect(() => {
    if (propUploadedImage) {
      setStoreUploadedImage(propUploadedImage);
    }
  }, [propUploadedImage, setStoreUploadedImage]);

  // Setze Fehler aus Props
  useEffect(() => {
    if (propError) {
      setError(propError);
      setStoreError(propError);
      handleFormError(propError);
    }
  }, [propError, setError, setStoreError, handleFormError]);

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
    isFormVisible,
    isEditModeActive
  }), [title, generatedContent, isFormVisible, isEditModeActive]);

  // Enhanced form submission with accessibility announcements
  const handleEnhancedSubmit = async (formData) => {
    try {
      // In edit mode, call a registered edit handler if present
      if (isEditModeActive && typeof editSubmitHandlerRef.current === 'function') {
        await editSubmitHandlerRef.current();
        return;
      }
      await onSubmit(formData);
      // Success is handled in the success useEffect above
    } catch (error) {
      handleFormError(error.message || 'Ein Fehler ist aufgetreten');
    }
  };

  // Inline privacy info help
  const handlePrivacyInfoClick = useCallback(() => {
    setInlineHelpContentOverride({
      content: 'Privacy-Mode: Alles wird in Deutschland verarbeitet - beste Datenschutz-Standards.',
      tips: [
        'Server: IONOS und netzbegruenung.de',
        'PDFs: maximal 10 Seiten',
        'Bilder werden ignoriert'
      ]
    });
  }, []);

  const handleWebSearchInfoClick = useCallback(() => {
    setInlineHelpContentOverride({
      content: 'Die Websuche durchsucht das Internet nach aktuellen und relevanten Informationen, um deine Eingaben zu ergänzen. Nützlich, wenn du wenig Vorwissen zum Thema hast oder aktuelle Daten benötigst.'
    });
  }, []);

  const handleErrorDismiss = useCallback(() => {
    // Clear both store and local error states
    clearStoreError();
    setError(null);
  }, [clearStoreError, setError]);

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
                  onSubmit={isEditModeActive && onEditSubmit ? onEditSubmit : (useModernForm ? handleEnhancedSubmit : onSubmit)}
                  isFormVisible={isFormVisible}
                  isMultiStep={isMultiStep}
                  onBack={onBack}
                  showBackButton={showBackButton}
                  nextButtonText={resolvedSubmitConfig.buttonText}
                  submitButtonProps={effectiveSubmitButtonProps}
                  webSearchFeatureToggle={resolvedWebSearchConfig.toggle}
                  privacyModeToggle={resolvedPrivacyModeConfig.toggle}
                  onAttachmentClick={onAttachmentClick}
                  onRemoveFile={onRemoveFile}
                  onPrivacyInfoClick={handlePrivacyInfoClick}
                  enablePlatformSelector={enablePlatformSelector}
                  platformOptions={platformOptions}
                  platformSelectorLabel={platformSelectorLabel}
                  platformSelectorPlaceholder={platformSelectorPlaceholder}
                  platformSelectorHelpText={platformSelectorHelpText}
                  formControl={formControl}
                  showSubmitButton={showSubmitButtonFinal}
                  formNotice={formNotice}
                  defaultValues={defaultValues}
                  validationRules={validationRules}
                  useModernForm={useModernForm}
                  onFormChange={onFormChange}
                  bottomSectionChildren={bottomSectionChildren}
                  showHideButton={hasContent} // Show hide button when content is available for manual toggle
                  onHide={toggleFormVisibility}
                  firstExtrasChildren={firstExtrasChildren}
                  featureIconsTabIndex={featureIconsTabIndex}
                  platformSelectorTabIndex={platformSelectorTabIndex}
                  knowledgeSelectorTabIndex={knowledgeSelectorTabIndex}
                  knowledgeSourceSelectorTabIndex={knowledgeSourceSelectorTabIndex}
                  documentSelectorTabIndex={documentSelectorTabIndex}
                  submitButtonTabIndex={submitButtonTabIndex}
                  showProfileSelector={showProfileSelector}
                  showImageUpload={showImageUpload}
                  onImageChange={onImageChange}
                  componentName={componentName}
                  onWebSearchInfoClick={handleWebSearchInfoClick}
                  useEditMode={isEditModeActive}
                  registerEditHandler={(fn) => { editSubmitHandlerRef.current = fn; }}
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
            helpContent={inlineHelpContentOverride || helpContent}
            generatedPost={generatedPost}
            onGeneratePost={onGeneratePost}
            getExportableContent={getExportableContentCallback}
            displayActions={displayActions}
            onSave={onSave}
            componentName={componentName}
            onErrorDismiss={handleErrorDismiss}
            onEditModeToggle={handleToggleEditMode}
            isEditModeActive={isEditModeActive}
          />
        </motion.div>

        {!isMobileView && (
          <Tooltip id="action-tooltip" place="bottom" />
        )}
      </motion.div>
    </>
  );
};

/**
 * Main BaseForm component that wraps BaseFormInternal with FormStateProvider
 * This provides form state isolation for multiple form instances
 */
const BaseForm = (props) => {
  const {
    componentName = 'default',
    // Extract initial state from props
    loading: propLoading,
    success: propSuccess,
    error: propError,
    formErrors: propFormErrors = {},
    useWebSearchFeatureToggle = false,
    usePrivacyModeToggle = false,
    useFeatureIcons: propUseFeatureIcons = false,
    attachedFiles: propAttachedFiles = [],
    uploadedImage: propUploadedImage = null,
    ...restProps
  } = props;

  // Create initial state from props for the store
  const initialFormState = React.useMemo(() => ({
    loading: propLoading || false,
    success: propSuccess || false,
    error: propError || null,
    formErrors: propFormErrors,
    webSearchConfig: {
      isActive: false,
      isSearching: false,
      statusMessage: '',
      enabled: useWebSearchFeatureToggle
    },
    privacyModeConfig: {
      isActive: false,
      enabled: usePrivacyModeToggle
    },
    proModeConfig: {
      isActive: false,
      enabled: true
    },
    useFeatureIcons: propUseFeatureIcons,
    attachedFiles: propAttachedFiles,
    uploadedImage: propUploadedImage,
    isFormVisible: true
  }), []); // Only use initial values on mount

  return (
    <FormStateProvider 
      formId={componentName}
      initialState={initialFormState}
    >
      <BaseFormInternal {...props} />
    </FormStateProvider>
  );
};

BaseFormInternal.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  success: PropTypes.bool,
  error: PropTypes.string,
  formErrors: PropTypes.object,
  onGeneratePost: PropTypes.func,
  onEditSubmit: PropTypes.func,
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
  disableAutoCollapse: PropTypes.bool, // Deprecated: form no longer auto-collapses
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
  privacyModeToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    icon: PropTypes.elementType,
    description: PropTypes.string
  }),
  usePrivacyModeToggle: PropTypes.bool,
  privacyModeConfig: PropTypes.shape({
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
  enableEditMode: PropTypes.bool,
  // TabIndex configuration
  platformSelectorTabIndex: PropTypes.number,
  knowledgeSelectorTabIndex: PropTypes.number,
  knowledgeSourceSelectorTabIndex: PropTypes.number,
  submitButtonTabIndex: PropTypes.number,
  showImageUpload: PropTypes.bool,
  uploadedImage: PropTypes.object,
  onImageChange: PropTypes.func
};

BaseFormInternal.defaultProps = {
  showNextButton: true,
  webSearchFeatureToggle: null,
  useWebSearchFeatureToggle: false,
  privacyModeToggle: null,
  usePrivacyModeToggle: false,
  displayActions: null,
  formNotice: null,
  onEditSubmit: null,
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
  enableEditMode: false,
  // TabIndex configuration defaults
  platformSelectorTabIndex: 12,
  knowledgeSelectorTabIndex: 14,
  knowledgeSourceSelectorTabIndex: 13,
  submitButtonTabIndex: 17,
  showImageUpload: false,
  uploadedImage: null,
  onImageChange: null
};

// Wrapper BaseForm PropTypes - same as BaseFormInternal
BaseForm.propTypes = BaseFormInternal.propTypes;
BaseForm.defaultProps = BaseFormInternal.defaultProps;

export default React.memo(BaseForm); 
