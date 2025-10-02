import React, { useEffect, useContext, useRef, useState, useCallback, useMemo } from 'react';
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
import { extractEditableText } from '../../../../stores/hooks/useTextEditActions';

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
  proModeToggle = null,
  useProModeToggle = false,
  proModeConfig = null,
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
  onImageChange = null,
  enableKnowledgeSelector = false
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
  const storeProModeConfig = useFormStateSelector(state => state.proModeConfig);
  const storeUseFeatureIcons = useFormStateSelector(state => state.useFeatureIcons);
  const storeAttachedFiles = useFormStateSelector(state => state.attachedFiles);
  const storeUploadedImage = useFormStateSelector(state => state.uploadedImage);
  const storeIsFormVisible = useFormStateSelector(state => state.isFormVisible);

  // Configuration selectors (new, safe with fallbacks)
  const storeTabIndexConfig = useFormStateSelector(state => state.tabIndexConfig);
  const storePlatformConfig = useFormStateSelector(state => state.platformConfig);
  const storeSubmitConfig = useFormStateSelector(state => state.submitConfig);
  const storeUIConfig = useFormStateSelector(state => state.uiConfig);
  const storeHelpConfig = useFormStateSelector(state => state.helpConfig);

  // Store helper functions
  const getFeatureState = useFormStateSelector(state => state.getFeatureState);

  // Configuration fallback helpers (store first, props second)
  const getConfigValue = React.useCallback((storeConfig, propValue, key, defaultValue) => {
    // Priority: store[key] -> propValue -> defaultValue
    return storeConfig[key] ?? propValue ?? defaultValue;
  }, []);

  const getTabIndexValue = React.useCallback((key, propValue, defaultValue) => {
    return getConfigValue(storeTabIndexConfig, propValue, key, defaultValue);
  }, [storeTabIndexConfig, getConfigValue]);

  // Resolved tabIndex values with store fallbacks
  const resolvedTabIndexes = React.useMemo(() => ({
    featureIcons: getTabIndexValue('featureIcons', featureIconsTabIndex, {
      webSearch: 11,
      privacyMode: 12,
      attachment: 13
    }),
    platformSelector: getTabIndexValue('platformSelector', platformSelectorTabIndex, 12),
    knowledgeSelector: getTabIndexValue('knowledgeSelector', knowledgeSelectorTabIndex, 14),
    knowledgeSourceSelector: getTabIndexValue('knowledgeSourceSelector', knowledgeSourceSelectorTabIndex, 13),
    documentSelector: getTabIndexValue('documentSelector', documentSelectorTabIndex, 15),
    submitButton: getTabIndexValue('submitButton', submitButtonTabIndex, 17)
  }), [
    getTabIndexValue,
    featureIconsTabIndex,
    platformSelectorTabIndex,
    knowledgeSelectorTabIndex,
    knowledgeSourceSelectorTabIndex,
    documentSelectorTabIndex,
    submitButtonTabIndex
  ]);

  // Resolved platform configuration with store fallbacks
  const resolvedPlatformConfig = React.useMemo(() => ({
    enabled: getConfigValue(storePlatformConfig, enablePlatformSelector, 'enabled', false),
    options: getConfigValue(storePlatformConfig, platformOptions, 'options', []),
    label: getConfigValue(storePlatformConfig, platformSelectorLabel, 'label', undefined),
    placeholder: getConfigValue(storePlatformConfig, platformSelectorPlaceholder, 'placeholder', undefined),
    helpText: getConfigValue(storePlatformConfig, platformSelectorHelpText, 'helpText', undefined)
  }), [
    storePlatformConfig,
    getConfigValue,
    enablePlatformSelector,
    platformOptions,
    platformSelectorLabel,
    platformSelectorPlaceholder,
    platformSelectorHelpText
  ]);

  // Resolved UI configuration with store fallbacks
  const resolvedUIConfig = React.useMemo(() => ({
    enableKnowledgeSelector: getConfigValue(storeUIConfig, enableKnowledgeSelector, 'enableKnowledgeSelector', false),
    showProfileSelector: getConfigValue(storeUIConfig, showProfileSelector, 'showProfileSelector', true),
    showImageUpload: getConfigValue(storeUIConfig, showImageUpload, 'showImageUpload', false),
    enableEditMode: getConfigValue(storeUIConfig, enableEditMode, 'enableEditMode', false),
    useMarkdown: getConfigValue(storeUIConfig, useMarkdown, 'useMarkdown', null)
  }), [
    storeUIConfig,
    getConfigValue,
    enableKnowledgeSelector,
    showProfileSelector,
    showImageUpload,
    enableEditMode,
    useMarkdown
  ]);

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
  
  const value = useGeneratedTextStore(state => state.generatedTexts[componentName] || '');
  const isStreaming = useGeneratedTextStore(state => state.isStreaming);
  const editableSource = useMemo(
    () => (generatedContent !== undefined && generatedContent !== null ? generatedContent : value),
    [generatedContent, value]
  );
  const editableText = useMemo(() => {
    const extracted = extractEditableText(editableSource);
    return typeof extracted === 'string' ? extracted.trim() : '';
  }, [editableSource]);
  const hasEditableContent = isStreaming || editableText.length > 0;
  const [isEditModeToggled, setIsEditModeToggled] = React.useState(false);
  const isEditModeActive = isEditModeToggled && enableEditMode && hasEditableContent;
  
  // Auto-activate edit mode when new text is generated (desktop only)
  const prevHasEditableContentRef = useRef(hasEditableContent);
  useEffect(() => {
    // Only auto-activate if:
    // 1. Edit mode is enabled for this component
    // 2. We just got content (transition from no content to has content)
    // 3. Edit mode isn't already active
    // 4. Not on mobile device
    const isMobileDevice = window.innerWidth <= 768;
    if (enableEditMode && !prevHasEditableContentRef.current && hasEditableContent && !isEditModeToggled && !isMobileDevice) {
      setIsEditModeToggled(true);
    }
    prevHasEditableContentRef.current = hasEditableContent;
  }, [hasEditableContent, enableEditMode, isEditModeToggled]);
  
  // Handler for edit mode toggle
  const handleToggleEditMode = React.useCallback(() => {
    console.log('[BaseForm] Toggling edit mode', {
      currentToggled: isEditModeToggled,
      enableEditMode,
      hasEditableContent,
      willBeActive: !isEditModeToggled && enableEditMode && hasEditableContent
    });
    setIsEditModeToggled(prev => !prev);
  }, [isEditModeToggled, enableEditMode, hasEditableContent]);

  // Handler for finetune mode toggle

  // Consolidated config with store fallbacks and backward compatibility
  const resolvedSubmitConfig = React.useMemo(() => {
    // Check store first, then props
    const storeShowButton = getConfigValue(storeSubmitConfig, null, 'showButton', null);
    const storeButtonText = getConfigValue(storeSubmitConfig, null, 'buttonText', null);
    const storeButtonProps = getConfigValue(storeSubmitConfig, null, 'buttonProps', null);

    if (submitConfig) {
      return {
        showButton: submitConfig.showButton ?? storeShowButton ?? showNextButton,
        buttonText: submitConfig.buttonText ?? storeButtonText ?? nextButtonText,
        buttonProps: submitConfig.buttonProps ?? storeButtonProps ?? submitButtonProps,
        ...submitConfig
      };
    }
    return {
      showButton: storeShowButton ?? showNextButton,
      buttonText: storeButtonText ?? nextButtonText,
      buttonProps: storeButtonProps ?? submitButtonProps
    };
  }, [submitConfig, showNextButton, nextButtonText, submitButtonProps, storeSubmitConfig, getConfigValue]);
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

  // Consolidated proMode config with store integration
  const resolvedProModeConfig = React.useMemo(() => {
    if (proModeConfig) {
      return {
        enabled: proModeConfig.enabled ?? storeProModeConfig.enabled ?? useProModeToggle,
        toggle: proModeConfig.toggle ?? proModeToggle,
        ...proModeConfig
      };
    }
    return {
      enabled: storeProModeConfig.enabled || useProModeToggle,
      toggle: proModeToggle
    };
  }, [proModeConfig, useProModeToggle, proModeToggle, storeProModeConfig]);

  // Use store form visibility with fallback to useFormVisibility
  const fallbackFormVisibility = useFormVisibility(hasEditableContent, disableAutoCollapse);
  const isFormVisible = storeIsFormVisible !== undefined ? storeIsFormVisible : fallbackFormVisibility.isFormVisible;
  const toggleFormVisibility = toggleStoreFormVisibility || fallbackFormVisibility.toggleFormVisibility;

  // Direct store access instead of useContentManagement
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

  // Synchronize props with store state - separate effects to prevent loops
  useEffect(() => {
    if (propLoading !== undefined && propLoading !== storeLoading) {
      setStoreLoading(propLoading);
    }
  }, [propLoading, storeLoading, setStoreLoading]);

  useEffect(() => {
    if (propSuccess !== undefined && propSuccess !== storeSuccess) {
      setStoreSuccess(propSuccess);
    }
  }, [propSuccess, storeSuccess, setStoreSuccess]);

  useEffect(() => {
    if (propFormErrors && Object.keys(propFormErrors).length > 0) {
      const currentErrorsLength = Object.keys(storeFormErrors).length;
      if (Object.keys(propFormErrors).length !== currentErrorsLength) {
        setStoreFormErrors(propFormErrors);
      }
    }
  }, [propFormErrors, storeFormErrors, setStoreFormErrors]);

  useEffect(() => {
    if (useWebSearchFeatureToggle !== undefined && useWebSearchFeatureToggle !== storeWebSearchConfig.enabled) {
      setStoreWebSearchEnabled(useWebSearchFeatureToggle);
    }
  }, [useWebSearchFeatureToggle, storeWebSearchConfig.enabled, setStoreWebSearchEnabled]);

  useEffect(() => {
    if (usePrivacyModeToggle !== undefined && usePrivacyModeToggle !== storePrivacyModeConfig.enabled) {
      setStorePrivacyModeEnabled(usePrivacyModeToggle);
    }
  }, [usePrivacyModeToggle, storePrivacyModeConfig.enabled, setStorePrivacyModeEnabled]);

  useEffect(() => {
    if (propUseFeatureIcons !== undefined && propUseFeatureIcons !== storeUseFeatureIcons) {
      setStoreUseFeatureIcons(propUseFeatureIcons);
    }
  }, [propUseFeatureIcons, storeUseFeatureIcons, setStoreUseFeatureIcons]);

  useEffect(() => {
    if (propAttachedFiles?.length > 0 && propAttachedFiles.length !== storeAttachedFiles.length) {
      setStoreAttachedFiles(propAttachedFiles);
    }
  }, [propAttachedFiles, storeAttachedFiles.length, setStoreAttachedFiles]);

  useEffect(() => {
    if (propUploadedImage && propUploadedImage !== storeUploadedImage) {
      setStoreUploadedImage(propUploadedImage);
    }
  }, [propUploadedImage, storeUploadedImage, setStoreUploadedImage]);

  // Handle errors separately to avoid dependency loops
  useEffect(() => {
    if (propError && propError !== storeError) {
      setError(propError);
      setStoreError(propError);
      handleFormError(propError);
    }
  }, [propError, storeError, setError, setStoreError, handleFormError]);

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
      
      // Get current feature states from the store
      const featureState = getFeatureState();

      // Debug: Log feature state
      console.log('[BaseForm] Feature state:', {
        proModeActive: featureState.proModeConfig?.isActive,
        privacyModeActive: featureState.privacyModeConfig?.isActive,
        webSearchActive: featureState.webSearchConfig?.isActive
      });

      // Enhance form data with current feature states
      const enhancedFormData = {
        ...formData,
        // Add pro mode flag for backend
        useBedrock: featureState.proModeConfig?.isActive || false,
        // Include other feature states if needed
        useWebSearchTool: featureState.webSearchConfig?.isActive || formData.useWebSearchTool || false,
        usePrivacyMode: featureState.privacyModeConfig?.isActive || formData.usePrivacyMode || false
      };

      console.log('[BaseForm] Enhanced form data:', {
        useBedrock: enhancedFormData.useBedrock,
        usePrivacyMode: enhancedFormData.usePrivacyMode,
        useWebSearchTool: enhancedFormData.useWebSearchTool
      });
      
      await onSubmit(enhancedFormData);
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
          {!isFormVisible && hasEditableContent && !isEditModeActive && (
            <FormToggleButtonFAB onClick={toggleFormVisibility} />
          )}
        </AnimatePresence>

        {/* In mobile edit mode, show DisplaySection first (top 50%) */}
        {isEditModeActive && isMobileView && (
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
              useMarkdown={resolvedUIConfig.useMarkdown}
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
              showEditModeToggle={resolvedUIConfig.enableEditMode}
            />
          </motion.div>
        )}

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
                proModeToggle={resolvedProModeConfig.toggle}
                onAttachmentClick={onAttachmentClick}
                onRemoveFile={onRemoveFile}
                onPrivacyInfoClick={handlePrivacyInfoClick}
                enablePlatformSelector={resolvedPlatformConfig.enabled}
                platformOptions={resolvedPlatformConfig.options}
                platformSelectorLabel={resolvedPlatformConfig.label}
                platformSelectorPlaceholder={resolvedPlatformConfig.placeholder}
                platformSelectorHelpText={resolvedPlatformConfig.helpText}
                formControl={formControl}
                showSubmitButton={showSubmitButtonFinal}
                formNotice={formNotice}
                defaultValues={defaultValues}
                validationRules={validationRules}
                useModernForm={useModernForm}
                onFormChange={onFormChange}
                bottomSectionChildren={bottomSectionChildren}
                showHideButton={hasEditableContent} // Show hide button when content is available for manual toggle
                onHide={toggleFormVisibility}
                firstExtrasChildren={firstExtrasChildren}
                featureIconsTabIndex={resolvedTabIndexes.featureIcons}
                platformSelectorTabIndex={resolvedTabIndexes.platformSelector}
                knowledgeSelectorTabIndex={resolvedTabIndexes.knowledgeSelector}
                knowledgeSourceSelectorTabIndex={resolvedTabIndexes.knowledgeSourceSelector}
                documentSelectorTabIndex={resolvedTabIndexes.documentSelector}
                submitButtonTabIndex={resolvedTabIndexes.submitButton}
                showProfileSelector={resolvedUIConfig.showProfileSelector}
                showImageUpload={resolvedUIConfig.showImageUpload}
                onImageChange={onImageChange}
                componentName={componentName}
                onWebSearchInfoClick={handleWebSearchInfoClick}
                useEditMode={isEditModeActive}
                registerEditHandler={(fn) => { editSubmitHandlerRef.current = fn; }}
                enableKnowledgeSelector={resolvedUIConfig.enableKnowledgeSelector}
              >
                {children}
              </FormSection>
            </motion.div>
          )}
        </AnimatePresence>

        {/* In desktop mode or non-edit mode, show DisplaySection after FormSection */}
        {(!isEditModeActive || !isMobileView) && (
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
              useMarkdown={resolvedUIConfig.useMarkdown}
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
              showEditModeToggle={resolvedUIConfig.enableEditMode}
            />
          </motion.div>
        )}

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
  proModeToggle: PropTypes.shape({
    isActive: PropTypes.bool,
    onToggle: PropTypes.func,
    label: PropTypes.string,
    description: PropTypes.string
  }),
  useProModeToggle: PropTypes.bool,
  proModeConfig: PropTypes.shape({
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
  proModeToggle: null,
  useProModeToggle: false,
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

// Optimized areEqual function for React.memo
const areEqual = (prevProps, nextProps) => {
  // Skip re-render if only callback functions changed (they're stable with useCallback)
  const callbackProps = [
    'onSubmit', 'onGeneratedContentChange', 'onAttachmentClick', 'onRemoveFile',
    'onFormChange', 'onImageChange', 'onSave', 'onBack', 'onEditSubmit',
    'onGeneratePost'
  ];

  // Check non-callback props for equality
  for (const [key, value] of Object.entries(nextProps)) {
    if (callbackProps.includes(key)) continue; // Skip callback comparison

    if (key === 'children') {
      // Special handling for children - compare type and key if available
      if (React.isValidElement(prevProps[key]) && React.isValidElement(value)) {
        if (prevProps[key].type !== value.type || prevProps[key].key !== value.key) {
          return false;
        }
      } else if (prevProps[key] !== value) {
        return false;
      }
    } else if (key === 'generatedContent') {
      // Deep comparison for generated content object
      if (typeof prevProps[key] === 'object' && typeof value === 'object') {
        if (JSON.stringify(prevProps[key]) !== JSON.stringify(value)) {
          return false;
        }
      } else if (prevProps[key] !== value) {
        return false;
      }
    } else if (key === 'attachedFiles' || key === 'platformOptions') {
      // Array comparison
      if (Array.isArray(prevProps[key]) && Array.isArray(value)) {
        if (prevProps[key].length !== value.length) return false;
        for (let i = 0; i < prevProps[key].length; i++) {
          if (prevProps[key][i] !== value[i]) return false;
        }
      } else if (prevProps[key] !== value) {
        return false;
      }
    } else if (typeof value === 'object' && value !== null && typeof prevProps[key] === 'object' && prevProps[key] !== null) {
      // Shallow object comparison for feature toggles, tab indices, etc.
      const prevKeys = Object.keys(prevProps[key]);
      const nextKeys = Object.keys(value);
      if (prevKeys.length !== nextKeys.length) return false;
      for (const objKey of prevKeys) {
        if (prevProps[key][objKey] !== value[objKey]) return false;
      }
    } else if (prevProps[key] !== value) {
      return false;
    }
  }

  return true;
};

export default React.memo(BaseForm, areEqual); 
