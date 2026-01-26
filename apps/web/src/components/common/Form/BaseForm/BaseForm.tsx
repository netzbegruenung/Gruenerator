import type {
  BaseFormProps,
  FeatureToggle,
  HelpContent,
  ExamplePrompt,
  ContextualTip,
  CustomExportOption,
  PlatformOption,
  FormControl,
  GeneratedContent,
} from '@/types/baseform';

import useGeneratedTextStore from '../../../../stores/core/generatedTextStore';
import FormStateProvider, {
  useFormState,
  useFormStateSelector,
  useFormStateSelectors,
} from '../FormStateProvider';

import isEqual from 'fast-deep-equal';
import { motion, AnimatePresence } from 'motion/react';
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  ReactNode,
  lazy,
  Suspense,
} from 'react';

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
import '../../../../assets/styles/components/baseform/start-page.css';

// Importiere die Komponenten

// Import hooks

// Import utilities

// Auto-save and Recent Texts
import { useTextAutoSave } from '../../../../hooks/useTextAutoSave';
import { getDocumentType } from '../../../../utils/documentTypeMapper';
import RecentTextsSection from '../../RecentTexts/RecentTextsSection';
import { useErrorHandling, useResponsive, useAutoScrollToContent } from '../hooks';
import { useBaseFormAccessibility } from '../hooks/useBaseFormAccessibility';
import { useContentManagement } from '../hooks/useContentManagement';
import { useEditMode } from '../hooks/useEditMode';
import { useFeatureConfigs } from '../hooks/useFeatureConfigs';
import { useFormConfiguration } from '../hooks/useFormConfiguration';
import { useFormEventHandlers } from '../hooks/useFormEventHandlers';
import { useFormStateSyncing } from '../hooks/useFormStateSyncing';
import { useFormVisibility } from '../hooks/useFormVisibility';
import { useStartMode } from '../hooks/useStartMode';
import { getBaseContainerClasses } from '../utils/classNameUtils';
import { getExportableContent } from '../utils/contentUtils';

import DisplaySection from './DisplaySection';
import FormSection from './FormSection';
import { FormToggleButtonFAB } from './FormToggleButtonFAB';

// Lazy load react-tooltip (only used on desktop, ~15KB)
const Tooltip = lazy(() => import('react-tooltip').then((mod) => ({ default: mod.Tooltip })));

/**
 * Internal BaseForm component that uses the FormStateProvider context
 */
const BaseFormInternal: React.FC<BaseFormProps> = ({
  title,
  subtitle,
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
  customRenderer = null,

  helpContent,
  submitButtonProps = {},
  disableAutoCollapse = false, // Deprecated: form no longer auto-collapses by default
  showNextButton = true,
  // New consolidated prop (optional, backward compatible)
  submitConfig = null,
  headerContent,
  // NEW: Consolidated features configuration
  features = undefined,
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
  interactiveModeToggle = null,
  useInteractiveModeToggle = false,
  interactiveModeConfig = null,
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
  extrasChildren = null,
  useMarkdown = null,
  enableEditMode = false,
  customEditContent = null, // Custom edit component for specialized editing (e.g., campaign sharepic editor)
  // TabIndex configuration
  featureIconsTabIndex = {
    webSearch: 11,
    privacyMode: 12,
    attachment: 13,
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
  enableKnowledgeSelector = false,
  hideFormExtras = false,
  hideInputSection = false,
  onImageEditModeChange = null, // Callback when image edit mode changes (true = active, false = inactive)
  customExportOptions = [],
  hideDefaultExportOptions = false,
  // Start page layout props
  useStartPageLayout = false, // Default to false - only PresseSocialGenerator uses start page layout
  startPageDescription = null, // 1-2 sentence description shown below title in start mode
  examplePrompts = [], // Array of { icon, text } for clickable example prompts
  onExamplePromptClick = null, // Callback when example prompt is clicked
  contextualTip = null, // Tip shown below example prompts { icon, text }
  selectedPlatforms = [], // Array of selected platform IDs for highlighting platform tags
  inputHeaderContent = null, // Content rendered above the textarea inside the form card
}) => {
  const baseFormRef = useRef<HTMLDivElement>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);
  const displaySectionRef = useRef<HTMLDivElement>(null);
  const [inlineHelpContentOverride, setInlineHelpContentOverride] = useState<HelpContent | null>(
    null
  );
  const editSubmitHandlerRef = useRef<(() => void | Promise<void>) | null>(null);

  // Batched store selectors using useShallow for optimal performance
  // This reduces subscriptions from 24 to 3, preventing cascade re-renders
  const {
    storeLoading,
    storeSuccess,
    storeError,
    storeFormErrors,
    storeSaveLoading,
    storeWebSearchConfig,
    storePrivacyModeConfig,
    storeProModeConfig,
    storeUseFeatureIcons,
    storeAttachedFiles,
    storeUploadedImage,
    storeIsFormVisible,
  } = useFormStateSelectors((state) => ({
    storeLoading: state.loading,
    storeSuccess: state.success,
    storeError: state.error,
    storeFormErrors: state.formErrors,
    storeSaveLoading: state.saveLoading,
    storeWebSearchConfig: state.webSearchConfig,
    storePrivacyModeConfig: state.privacyModeConfig,
    storeProModeConfig: state.proModeConfig,
    storeUseFeatureIcons: state.useFeatureIcons,
    storeAttachedFiles: state.attachedFiles,
    storeUploadedImage: state.uploadedImage,
    storeIsFormVisible: state.isFormVisible,
  }));

  // Configuration selectors (batched with shallow comparison)
  const {
    storeTabIndexConfig,
    storePlatformConfig,
    storeSubmitConfig,
    storeUIConfig,
    storeHelpConfig,
  } = useFormStateSelectors((state) => ({
    storeTabIndexConfig: state.tabIndexConfig,
    storePlatformConfig: state.platformConfig,
    storeSubmitConfig: state.submitConfig,
    storeUIConfig: state.uiConfig,
    storeHelpConfig: state.helpConfig,
  }));

  // Store helper functions (these are stable references, single selector is fine)
  const setIsStartMode = useFormStateSelector((state) => state.setIsStartMode);
  const getFeatureState = useFormStateSelector((state) => state.getFeatureState);

  // Store actions (batched - functions are stable references)
  const {
    setStoreLoading,
    setStoreSuccess,
    setStoreError,
    setStoreFormErrors,
    setStoreSaveLoading,
    clearStoreError,
    setStoreWebSearchEnabled,
    setStorePrivacyModeEnabled,
    setStoreUseFeatureIcons,
    setStoreAttachedFiles,
    setStoreUploadedImage,
    toggleStoreFormVisibility,
  } = useFormStateSelectors((state) => ({
    setStoreLoading: state.setLoading,
    setStoreSuccess: state.setSuccess,
    setStoreError: state.setError,
    setStoreFormErrors: state.setFormErrors,
    setStoreSaveLoading: state.setSaveLoading,
    clearStoreError: state.clearError,
    setStoreWebSearchEnabled: state.setWebSearchEnabled,
    setStorePrivacyModeEnabled: state.setPrivacyModeEnabled,
    setStoreUseFeatureIcons: state.setUseFeatureIcons,
    setStoreAttachedFiles: state.setAttachedFiles,
    setStoreUploadedImage: state.setUploadedImage,
    toggleStoreFormVisibility: state.toggleFormVisibility,
  }));

  const errorHandling = useErrorHandling() as {
    error: string;
    setError: (error: string | Error | null) => void;
    getErrorMessage: (error: string) => string;
    handleSubmitError: (error: Error) => void;
    clearError: () => void;
  };
  const error = errorHandling.error;
  const setError = errorHandling.setError;

  // Use store state with prop fallbacks
  const loading = storeLoading || propLoading;
  const success = storeSuccess || propSuccess;
  const formErrors = Object.keys(storeFormErrors).length > 0 ? storeFormErrors : propFormErrors;
  const saveLoading = storeSaveLoading || propSaveLoading;
  const useFeatureIcons = storeUseFeatureIcons || propUseFeatureIcons;
  const attachedFiles = storeAttachedFiles.length > 0 ? storeAttachedFiles : propAttachedFiles;
  const uploadedImage = storeUploadedImage || propUploadedImage;

  // Configuration hooks
  const configs = useFormConfiguration({
    storeTabIndexConfig,
    storePlatformConfig,
    storeSubmitConfig,
    storeUIConfig,
    featureIconsTabIndex,
    platformSelectorTabIndex,
    knowledgeSelectorTabIndex,
    knowledgeSourceSelectorTabIndex,
    documentSelectorTabIndex,
    submitButtonTabIndex,
    enablePlatformSelector,
    platformOptions,
    platformSelectorLabel,
    platformSelectorPlaceholder,
    platformSelectorHelpText,
    enableKnowledgeSelector,
    showProfileSelector,
    showImageUpload,
    enableEditMode,
    useMarkdown,
    submitConfig,
    showNextButton,
    nextButtonText,
    submitButtonProps,
    isEditModeActive: false, // Will be updated below after edit mode hook
  });

  const {
    resolvedTabIndexes,
    resolvedPlatformConfig,
    resolvedUIConfig,
    resolvedSubmitConfig,
    effectiveSubmitButtonProps,
  } = configs;

  // Feature configuration hooks
  const featureConfigs = useFeatureConfigs({
    // NEW: Consolidated features prop (preferred)
    features,

    // DEPRECATED: Individual props (backward compatibility)
    webSearchFeatureToggle,
    useWebSearchFeatureToggle,
    webSearchConfig,
    storeWebSearchConfig,
    privacyModeToggle,
    usePrivacyModeToggle,
    privacyModeConfig,
    storePrivacyModeConfig,
    proModeToggle,
    useProModeToggle,
    proModeConfig,
    storeProModeConfig,
    interactiveModeToggle,
    useInteractiveModeToggle,
    interactiveModeConfig,
  });

  const {
    resolvedWebSearchConfig,
    resolvedPrivacyModeConfig,
    resolvedProModeConfig,
    resolvedInteractiveModeConfig,
  } = featureConfigs;

  // Content management hook
  const content = useContentManagement({
    componentName,
    generatedContent,
    initialContent,
  });

  const {
    value,
    editableText,
    hasEditableContent,
    hasSharepicContent,
    hasAnyContent,
    handleLoadRecentText,
  } = content;

  // Responsive hook
  const responsiveState = useResponsive() as {
    isMobileView: boolean;
    updateMobileState: () => void;
    getDisplayTitle: (
      title: string,
      isEditing: boolean,
      generatedContent: GeneratedContent | undefined
    ) => string;
  };
  const { isMobileView, getDisplayTitle } = responsiveState;

  // Edit mode hook
  const editMode = useEditMode({
    enableEditMode: resolvedUIConfig.enableEditMode,
    hasEditableContent,
    isMobileView,
    onImageEditModeChange,
  });

  const {
    isEditModeToggled,
    isEditModeActive,
    isImageEditActive,
    handleToggleEditMode,
    handleToggleImageEdit,
  } = editMode;

  // Update configs with actual isEditModeActive value
  const effectiveSubmitButtonPropsUpdated = React.useMemo(() => {
    const base = (resolvedSubmitConfig.buttonProps || {}) as Record<string, unknown>;
    if (isEditModeActive) {
      return { ...base, defaultText: (base.defaultText as string) || 'Verbessern' };
    }
    return base;
  }, [resolvedSubmitConfig.buttonProps, isEditModeActive]);

  // Start mode and form visibility hook
  const fallbackFormVisibility = useFormVisibility(hasEditableContent, disableAutoCollapse) as {
    isFormVisible: boolean;
    toggleFormVisibility: () => void;
  };

  const startModeState = useStartMode({
    useStartPageLayout,
    hasAnyContent,
    storeIsFormVisible,
    toggleStoreFormVisibility,
    fallbackFormVisibility,
    setIsStartMode,
  });

  const { isStartMode, isFormVisible, toggleFormVisibility } = startModeState;

  // Auto-activate edit mode when new text is generated (desktop only)
  // const prevHasEditableContentRef = useRef(hasEditableContent);
  // useEffect(() => {
  //   // Only auto-activate if:
  //   // 1. Edit mode is enabled for this component
  //   // 2. We just got content (transition from no content to has content)
  //   // 3. Edit mode isn't already active
  //   // 4. Not on mobile device
  //   const isMobileDevice = window.innerWidth <= 768;
  //   if (enableEditMode && !prevHasEditableContentRef.current && hasEditableContent && !isEditModeToggled && !isMobileDevice) {
  //     setIsEditModeToggled(true);
  //   }
  //   prevHasEditableContentRef.current = hasEditableContent;
  // }, [hasEditableContent, enableEditMode, isEditModeToggled]);

  const showSubmitButtonFinal = resolvedSubmitConfig.showButton;

  // Auto-scroll to generated text on mobile with smart positioning
  useAutoScrollToContent(displaySectionRef, hasEditableContent, {
    mobileOnly: true,
    mobileBreakpoint: 768,
    delay: 100,
    topOffset: 80,
    centerThreshold: 0.8,
  });

  // Function to get exportable content
  // Convert StoredContent to string for type safety
  const valueAsString = typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
  const getExportableContentCallback = useCallback(
    (content: unknown) => {
      const safeContent =
        typeof content === 'string' ? content : content ? JSON.stringify(content) : '';
      return getExportableContent(safeContent, valueAsString);
    },
    [valueAsString]
  );

  // Accessibility hook - provides error/success handlers
  const { handleFormError, handleFormSuccess } = useBaseFormAccessibility({
    baseFormRef,
    generatedContent,
    children,
    accessibilityOptions,
  });

  // Form state syncing hook - syncs props to store
  useFormStateSyncing({
    propLoading,
    propSuccess: success,
    propError: error,
    propFormErrors: formErrors,
    useWebSearchFeatureToggle,
    usePrivacyModeToggle,
    propUseFeatureIcons: useFeatureIcons,
    propAttachedFiles: attachedFiles,
    propUploadedImage: uploadedImage,
    storeFormErrors,
    storeWebSearchConfig,
    storePrivacyModeConfig,
    storeUseFeatureIcons,
    storeAttachedFiles,
    storeUploadedImage,
    storeError,
    setStoreLoading,
    setStoreSuccess,
    setStoreError,
    setStoreFormErrors,
    setStoreWebSearchEnabled,
    setStorePrivacyModeEnabled,
    setStoreUseFeatureIcons,
    setStoreAttachedFiles,
    setStoreUploadedImage,
    handleFormError,
    setError,
  });

  // Event handlers hook
  const {
    handleEnhancedSubmit,
    handleExamplePromptClick,
    handlePrivacyInfoClick,
    handleWebSearchInfoClick,
    handleErrorDismiss,
  } = useFormEventHandlers({
    onSubmit,
    onExamplePromptClick,
    editSubmitHandlerRef,
    isEditModeActive,
    getFeatureState,
    handleFormError,
    setInlineHelpContentOverride,
    clearStoreError,
    setError,
  });

  // Auto-save hook
  useTextAutoSave({
    componentName,
    enabled: true,
    debounceMs: 3000,
  });

  // Berechne den Anzeigetitel (memoized for performance)
  const displayTitle = React.useMemo(() => {
    const computedTitle = getDisplayTitle('', false, generatedContent);
    return typeof computedTitle === 'string' ? computedTitle : '';
  }, [getDisplayTitle, generatedContent]);

  // Berechne die Klassennamen für den Container (memoized for performance)
  const baseContainerClasses = React.useMemo(
    () =>
      getBaseContainerClasses({
        title: typeof title === 'string' ? title : undefined,
        generatedContent,
        isFormVisible,
        isEditModeActive,
        isStartMode,
      }),
    [title, generatedContent, isFormVisible, isEditModeActive, isStartMode]
  );

  return (
    <div className="base-form-wrapper">
      {headerContent}
      <motion.div
        /* layout */
        transition={{ duration: 0.25, ease: 'easeOut' }}
        ref={baseFormRef}
        className={baseContainerClasses}
        role="main"
        aria-label={typeof title === 'string' ? title : 'Formular'}
        id="main-content"
      >
        <AnimatePresence initial={false}>
          {!isFormVisible && hasAnyContent && !isEditModeActive && (
            <FormToggleButtonFAB onClick={toggleFormVisibility} />
          )}
        </AnimatePresence>

        {/*
          Mobile edit mode: UniversalEditForm now handles full-screen chat takeover.
          DisplaySection is hidden on mobile edit mode since the chat shows the full text.
        */}

        <AnimatePresence initial={false}>
          {/* On mobile edit mode, UniversalEditForm handles its own full-screen takeover via position:fixed */}
          {(isFormVisible || (isEditModeActive && isMobileView)) && (
            <motion.div
              key="form-section"
              /* layout="position" */
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{
                duration: 0.25,
                ease: 'easeOut',
              }}
              className="form-section-motion-wrapper"
            >
              <FormSection
                ref={formSectionRef}
                title={title}
                subtitle={subtitle}
                onSubmit={
                  isEditModeActive && onEditSubmit
                    ? () => onEditSubmit('')
                    : useModernForm
                      ? handleEnhancedSubmit
                      : onSubmit
                }
                isFormVisible={isFormVisible}
                isMultiStep={isMultiStep}
                onBack={onBack}
                showBackButton={showBackButton}
                nextButtonText={resolvedSubmitConfig.buttonText}
                submitButtonProps={effectiveSubmitButtonProps}
                interactiveModeToggle={
                  resolvedInteractiveModeConfig.enabled
                    ? resolvedInteractiveModeConfig.toggle
                    : null
                }
                useInteractiveModeToggle={resolvedInteractiveModeConfig.enabled}
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
                showHideButton={hasAnyContent}
                onHide={toggleFormVisibility}
                firstExtrasChildren={firstExtrasChildren}
                extrasChildren={extrasChildren}
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
                onCloseEditMode={handleToggleEditMode}
                isImageEditActive={isImageEditActive}
                customEditContent={customEditContent}
                registerEditHandler={(fn) => {
                  editSubmitHandlerRef.current = fn;
                }}
                enableKnowledgeSelector={resolvedUIConfig.enableKnowledgeSelector}
                hideExtrasSection={hideFormExtras}
                isStartMode={isStartMode}
                startPageDescription={startPageDescription}
                examplePrompts={examplePrompts}
                onExamplePromptClick={handleExamplePromptClick}
                contextualTip={contextualTip}
                selectedPlatforms={selectedPlatforms}
                inputHeaderContent={inputHeaderContent}
                helpContent={helpContent}
              >
                {children}
              </FormSection>
            </motion.div>
          )}
        </AnimatePresence>

        {/* In desktop mode or non-edit mode, show DisplaySection after FormSection (hidden in start mode or when no content) */}
        {(!isEditModeActive || !isMobileView) && !isStartMode && hasAnyContent && (
          <motion.div
            /* layout */
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`display-section-motion-wrapper ${isFormVisible ? 'form-visible' : 'form-hidden'}`}
          >
            <DisplaySection
              ref={displaySectionRef}
              title={typeof displayTitle === 'string' ? displayTitle : ''}
              error={error || propError}
              value={valueAsString}
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
              onEditModeToggle={customEditContent ? handleToggleImageEdit : handleToggleEditMode}
              isEditModeActive={isEditModeActive}
              showEditModeToggle={resolvedUIConfig.enableEditMode}
              customEditContent={customEditContent}
              customRenderer={customRenderer}
              customExportOptions={customExportOptions}
              hideDefaultExportOptions={hideDefaultExportOptions}
              isStartMode={isStartMode}
            />
          </motion.div>
        )}

        {!isMobileView && (
          <Suspense fallback={null}>
            <Tooltip id="action-tooltip" place="bottom" />
          </Suspense>
        )}
      </motion.div>

      {/* Recent texts section - only for TexteTab (useStartPageLayout), renders in any mode */}
      {useStartPageLayout && (
        <RecentTextsSection
          generatorType={getDocumentType(componentName)}
          onTextLoad={handleLoadRecentText}
        />
      )}
    </div>
  );
};

/**
 * Main BaseForm component that wraps BaseFormInternal with FormStateProvider
 * This provides form state isolation for multiple form instances
 */
const BaseForm: React.FC<BaseFormProps> = (props) => {
  const {
    componentName = 'default',
    // Extract initial state from props
    loading: propLoading,
    success: propSuccess,
    error: propError,
    formErrors: propFormErrors = {},
    useWebSearchFeatureToggle = false,
    usePrivacyModeToggle = false,
    useInteractiveModeToggle = false,
    useFeatureIcons: propUseFeatureIcons = false,
    attachedFiles: propAttachedFiles = [],
    uploadedImage: propUploadedImage = null,
    ...restProps
  } = props;

  // Create initial state from props for the store
  // Convert ErrorValue to string for FormStateStore compatibility
  const errorString: string | null = propError
    ? typeof propError === 'string'
      ? propError
      : (propError as Error)?.message || String(propError)
    : null;

  const initialFormState = React.useMemo(
    () => ({
      loading: propLoading || false,
      success: propSuccess || false,
      error: errorString,
      formErrors: propFormErrors,
      webSearchConfig: {
        isActive: false,
        isSearching: false,
        statusMessage: '',
        enabled: useWebSearchFeatureToggle,
      },
      privacyModeConfig: {
        isActive: false,
        enabled: usePrivacyModeToggle,
      },
      proModeConfig: {
        isActive: false,
        enabled: true,
      },
      interactiveModeConfig: {
        isActive: false,
        enabled: useInteractiveModeToggle,
      },
      useFeatureIcons: propUseFeatureIcons,
      attachedFiles: propAttachedFiles,
      uploadedImage: propUploadedImage,
      isFormVisible: true,
    }),
    []
  ); // Only use initial values on mount

  return (
    <FormStateProvider formId={componentName} initialState={initialFormState}>
      <BaseFormInternal {...props} />
    </FormStateProvider>
  );
};

// Optimized areEqual function for React.memo
const areEqual = (prevProps: BaseFormProps, nextProps: BaseFormProps): boolean => {
  // Skip re-render if only callback functions changed (they're stable with useCallback)
  const callbackProps = [
    'onSubmit',
    'onGeneratedContentChange',
    'onAttachmentClick',
    'onRemoveFile',
    'onFormChange',
    'onImageChange',
    'onSave',
    'onBack',
    'onEditSubmit',
    'onGeneratePost',
  ];

  // Type-safe accessor for BaseFormProps
  const getProp = (props: BaseFormProps, key: keyof BaseFormProps) => props[key];

  // Check non-callback props for equality
  for (const [key, value] of Object.entries(nextProps)) {
    if (callbackProps.includes(key)) continue; // Skip callback comparison

    const propKey = key as keyof BaseFormProps;
    const prevValue = getProp(prevProps, propKey);

    if (key === 'children') {
      // Special handling for children - compare type and key if available
      if (React.isValidElement(prevValue) && React.isValidElement(value)) {
        if (prevValue.type !== value.type || prevValue.key !== value.key) {
          return false;
        }
      } else if (prevValue !== value) {
        return false;
      }
    } else if (key === 'generatedContent') {
      // Deep comparison for generated content object using fast-deep-equal
      // isEqual is O(n) but much faster than JSON.stringify for large objects
      if (!isEqual(prevValue, value)) {
        return false;
      }
    } else if (key === 'attachedFiles' || key === 'platformOptions') {
      // Array comparison
      const prevArr = prevValue as unknown[] | undefined;
      const nextArr = value as unknown[] | undefined;
      if (Array.isArray(prevArr) && Array.isArray(nextArr)) {
        if (prevArr.length !== nextArr.length) return false;
        for (let i = 0; i < prevArr.length; i++) {
          if (prevArr[i] !== nextArr[i]) return false;
        }
      } else if (prevValue !== value) {
        return false;
      }
    } else if (
      typeof value === 'object' &&
      value !== null &&
      typeof prevValue === 'object' &&
      prevValue !== null
    ) {
      // Shallow object comparison for feature toggles, tab indices, etc.
      const prevObj = prevValue as Record<string, unknown>;
      const nextObj = value as Record<string, unknown>;
      const prevKeys = Object.keys(prevObj);
      const nextKeys = Object.keys(nextObj);
      if (prevKeys.length !== nextKeys.length) return false;
      for (const objKey of prevKeys) {
        if (prevObj[objKey] !== nextObj[objKey]) return false;
      }
    } else if (prevValue !== value) {
      return false;
    }
  }

  return true;
};

export default React.memo(BaseForm, areEqual);
